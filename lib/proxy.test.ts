import { afterEach, expect, suite, test } from "vitest";

import { Change } from "./change";
import { hooks } from "./hooks";
import { GENERATION } from "./object";
import * as cut from "./proxy";
import { TransactionConflictError } from "./transaction";

suite("without transaction", () => {
  test("newRoot/get", () => {
    const got = cut.wrapObject({ a: true } as { a: boolean });

    expect(got).toEqual({ a: true });
  });

  test("newRoot cyclic", () => {
    const a: { b?: object } = {};
    a.b = a;
    const got = cut.wrapObject(a);

    expect(got.b).toBe(got);
  });

  test("newRoot nested", () => {
    const got = cut.wrapObject(cut.wrapObject({ a: true }));

    expect(got).toEqual({ a: true });
  });

  test("has", () => {
    const got = cut.wrapObject({ a: false } as { a: boolean });

    expect("a" in got).toBe(true);
  });

  test("keys", () => {
    const got = cut.wrapObject({ a: false } as { a: boolean });

    expect(Object.keys(got)).toEqual(["a"]);
  });

  test("set", () => {
    const got = cut.wrapObject({ a: false } as { a: boolean });

    got.a = true;

    expect(got).toEqual({ a: true });
  });

  test("set new", () => {
    const got = cut.wrapObject({ a: false } as { a: boolean; b?: boolean });

    got.b = true;

    expect("b" in got).toBe(true);
    expect(got).toEqual({
      a: false,
      b: true,
    });
  });

  test("deleteProperty", () => {
    const got = cut.wrapObject({ a: false, b: true } as {
      a: boolean;
      b?: boolean;
    });

    delete got.b;

    expect("b" in got).toBe(false);
  });
});

suite("ObjectBuffer", () => {
  test("checkCommittable", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getWriteValue().a = false;

    buf.checkCommittable();

    expect(target.a).toEqual(true);
    expect(target[GENERATION]).toEqual(1);
  });

  test("checkCommittable write conflict", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getWriteValue().a = false;

    target[GENERATION] = 3;

    expect(() => buf.checkCommittable()).toThrowError(TransactionConflictError);
  });

  test("checkCommittable read conflict", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getReadValue();

    target[GENERATION] = 3;

    expect(() => buf.checkCommittable()).toThrowError(TransactionConflictError);
  });

  test("checkMergeableInto", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 3 });
    buf.getWriteValue();

    const buf2 = new cut.ObjectBuffer(target, { generation: 2 });
    buf.checkMergeableInto(buf2);

    expect(target.a).toEqual(true);
    expect(target[GENERATION]).toEqual(1);
  });

  test("checkMergeableInto target write conflict", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 3 });
    buf.getWriteValue();

    target[GENERATION] = 4;

    const buf2 = new cut.ObjectBuffer(target, { generation: 2 });

    expect(() => buf.checkMergeableInto(buf2)).toThrowError(TransactionConflictError);
  });

  test("checkMergeableInto write/write conflict", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 3 });
    buf.getWriteValue();

    const buf2 = new cut.ObjectBuffer(target, { generation: 2 });
    buf2.getWriteValue();

    expect(() => buf.checkMergeableInto(buf2)).toThrowError(TransactionConflictError);
  });

  test("checkMergeableInto read/write conflict", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getReadValue();

    target[GENERATION] = 3;

    const buf2 = new cut.ObjectBuffer(target, { generation: 3 });
    buf2.getWriteValue();

    expect(() => buf.checkMergeableInto(buf2)).toThrowError(TransactionConflictError);
  });

  test("commit set", () => {
    const target = { a: true, [GENERATION]: 1 };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getWriteValue().a = false;

    buf.commit();

    expect(target.a).toEqual(false);
    expect(target[GENERATION]).toEqual(2);
  });

  test("commit delete", () => {
    const target = { a: true, [GENERATION]: 1 } as { a?: boolean; [GENERATION]: number };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    delete buf.getWriteValue().a;

    buf.commit();

    expect("a" in target).toEqual(false);
    expect(target[GENERATION]).toEqual(2);
  });

  test("mergeInto set", () => {
    const target = { a: true, [GENERATION]: 1 } as { a?: boolean; [GENERATION]: number };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    buf.getWriteValue().a = false;

    const buf2 = new cut.ObjectBuffer(target, { generation: 3 });
    buf.mergeInto(buf2);

    expect(buf2.getReadValue().a).toEqual(false);
    expect(target.a).toEqual(true);
    expect(target[GENERATION]).toEqual(1);
  });

  test("mergeInto delete", () => {
    const target = { a: true, [GENERATION]: 1 } as { a?: boolean; [GENERATION]: number };
    const buf = new cut.ObjectBuffer(target, { generation: 2 });
    delete buf.getWriteValue().a;

    const buf2 = new cut.ObjectBuffer(target, { generation: 3 });
    buf.mergeInto(buf2);

    expect("a" in buf2.getReadValue()).toEqual(false);
    expect("a" in target).toEqual(true);
    expect(target[GENERATION]).toEqual(1);
  });
});

suite("hooks", () => {
  const origHooks = { ...hooks };
  afterEach(() => {
    Object.assign(hooks, origHooks);
  });

  test("change set", () => {
    const changes: Change[] = [];
    hooks.change = (_target, changeFun) => changes.push(changeFun());

    const got = cut.wrapObject({ a: true } as { a: boolean });
    got.a = false;

    expect(changes).toEqual([
      {
        type: "setvalue",
        target: got,
        property: "a",
        value: false,
      },
    ]);
  });

  test("change delete", () => {
    const changes: Change[] = [];
    hooks.change = (_target, changeFun) => changes.push(changeFun());

    const got = cut.wrapObject({ a: true } as { a: boolean });
    delete got.a;

    expect(changes).toEqual([
      {
        type: "deletevalue",
        target: got,
        property: "a",
      },
    ]);
  });
});
