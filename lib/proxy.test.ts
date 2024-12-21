import { afterEach, expect, suite, test, vi } from "vitest";

import { hooks } from "./hooks";
import * as cut from "./proxy";

suite("without transaction", () => {
  test("newRoot/get", () => {
    const got = cut.newRoot({ a: true } as { a: boolean });

    expect(got).toEqual({ a: true });
  });

  test("newRoot cyclic", () => {
    const a: { b: any } = { b: undefined };
    a.b = a;
    const got = cut.newRoot(a);

    expect(got.b).toBe(got);
  });

  test("newRoot nested", () => {
    const got = cut.newRoot(cut.newRoot({ a: true }));

    expect(got).toEqual({ a: true });
  });

  test("has", () => {
    const got = cut.newRoot({ a: false } as { a: boolean });

    expect("a" in got).toBe(true);
  });

  test("keys", () => {
    const got = cut.newRoot({ a: false } as { a: boolean });

    expect(Object.keys(got)).toEqual(["a"]);
  });

  test("set", () => {
    const got = cut.newRoot({ a: false } as { a: boolean });

    got.a = true;

    expect(got).toEqual({ a: true });
  });

  test("set new", () => {
    const got = cut.newRoot({ a: false } as { a: boolean; b?: boolean });

    got.b = true;

    expect("b" in got).toBe(true);
    expect(got).toEqual({
      a: false,
      b: true,
    });
  });

  test("deleteProperty", () => {
    const got = cut.newRoot({ a: false, b: true } as {
      a: boolean;
      b?: boolean;
    });

    delete got.b;

    expect("b" in got).toBe(false);
  });
});
suite("hooks", () => {
  const origHooks = { ...hooks };
  afterEach(() => {
    Object.assign(hooks, origHooks);
  });

  test("newRoot", () => {
    hooks.newRoot = vi.fn();

    const want = { a: true } as { a: boolean };
    const got = cut.newRoot(want);

    expect(hooks.newRoot).toBeCalledWith(want, got);
  });
});
