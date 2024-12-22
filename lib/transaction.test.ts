import { afterEach, expect, suite, test, vi } from "vitest";

import { Change } from "./change";
import { hooks } from "./hooks";
import { AnyTarget, GENERATION } from "./object";
import * as cut from "./transaction";

const MockBuffer = vi
  .fn()
  .mockImplementation((_target: AnyTarget, _tx: cut.TransactionImpl, _outer: cut.Buffer) => {
    return {
      changes: vi.fn(),
      checkCommittable: vi.fn(),
      checkMergeableInto: vi.fn(),
      commit: vi.fn(),
      mergeInto: vi.fn(),
    } satisfies cut.Buffer;
  });

suite("transaction", () => {
  test("newTransaction + dispose", () => {
    cut.newTransaction().dispose();
  });

  test("commit", () => {
    const target = { a: true, [GENERATION]: 1 };
    const tx = new cut.TransactionImpl(2);

    try {
      const buf = tx.getBuffer(target, MockBuffer);

      tx.commit();

      expect(buf.checkCommittable).toHaveBeenCalled();
      expect(buf.commit).toHaveBeenCalled();

      expect(buf.checkMergeableInto).not.toHaveBeenCalled();
      expect(buf.mergeInto).not.toHaveBeenCalled();
    } finally {
      tx.dispose();
    }
  });

  test("commit nested", () => {
    const target = { a: true, [GENERATION]: 1 };
    const tx1 = new cut.TransactionImpl(2);
    const tx2 = new cut.TransactionImpl(3, tx1);

    try {
      const buf = tx2.getBuffer(target, MockBuffer);

      tx2.commit();

      expect(buf.checkCommittable).not.toHaveBeenCalled();
      expect(buf.commit).not.toHaveBeenCalled();

      expect(buf.checkMergeableInto).toHaveBeenCalled();
      expect(buf.mergeInto).toHaveBeenCalled();
    } finally {
      tx2.dispose();
    }
  });

  test("call", () => {
    const tx = new cut.TransactionImpl(2);

    try {
      tx.call(() => {
        expect(cut.currentTx).toEqual(tx);
      });
    } finally {
      tx.dispose();
    }
  });
});

suite("inTransaction", () => {
  test("commit", () => {
    const target = { a: true, [GENERATION]: 1 };

    const buf = cut.inTransaction(() => {
      return cut.currentTx!.getBuffer(target, MockBuffer);
    });

    expect(buf.commit).toHaveBeenCalled();
  });

  test("abort", () => {
    const target = { a: true, [GENERATION]: 1 };

    let buf: ReturnType<typeof MockBuffer> | undefined;
    expect(() => {
      cut.inTransaction(() => {
        buf = cut.currentTx!.getBuffer(target, MockBuffer);
        throw new Error("abort");
      });
    }).toThrow();

    expect(buf.commit).not.toHaveBeenCalled();
  });
});

suite("hooks", () => {
  const origHooks = { ...hooks };
  afterEach(() => {
    Object.assign(hooks, origHooks);
  });

  test("dispose clean", () => {
    hooks.dispose = vi.fn();

    const tx = new cut.TransactionImpl(2);
    tx.dispose();

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("dispose uncommitted", () => {
    hooks.dispose = vi.fn();

    const target = { a: true, [GENERATION]: 1 };
    const tx = new cut.TransactionImpl(2);

    try {
      tx.getBuffer(target, MockBuffer);
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ true);
  });

  test("dispose committed", () => {
    hooks.dispose = vi.fn();

    const tx = new cut.TransactionImpl(2);

    try {
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("dispose committed", () => {
    hooks.dispose = vi.fn();

    const target = { a: true, [GENERATION]: 1 };
    const tx = new cut.TransactionImpl(2);

    try {
      tx.getBuffer(target, MockBuffer);
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("enter/leave", () => {
    const leave = vi.fn();
    hooks.enter = vi.fn(() => leave);

    const tx = new cut.TransactionImpl(2);

    try {
      tx.call(() => {
        expect(hooks.enter).toBeCalledWith(tx);
      });
    } finally {
      tx.dispose();
    }

    expect(leave).toBeCalledWith();
  });

  test("commit/postCommit", () => {
    const postCommit = vi.fn();
    hooks.commit = vi.fn(() => postCommit);

    const tx = new cut.TransactionImpl(2);

    try {
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(hooks.commit).toBeCalledWith(tx, expect.anything(), /*nested=*/ false);
    expect(postCommit).toBeCalledWith();
  });

  test("commit changes", () => {
    const changes: Change[] = [];
    hooks.commit = (_tx, newChanges) => {
      changes.push(...newChanges);
    };

    const target = { a: true, [GENERATION]: 1 };
    const tx = new cut.TransactionImpl(2);

    const buf = new MockBuffer();
    buf.changes.mockReturnValue([
      {
        type: "deletevalue",
        target,
        property: "b",
      },
    ]);

    try {
      tx.getBuffer(
        target,
        vi.fn().mockImplementation(() => buf),
      );
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(changes).toEqual([
      {
        type: "deletevalue",
        target,
        property: "b",
      },
    ]);
  });
});
