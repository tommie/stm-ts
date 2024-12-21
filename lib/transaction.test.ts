import { afterEach, expect, suite, test, vi } from "vitest";

import { Change } from "./change";
import { hooks } from "./hooks";
import { newRoot } from "./proxy";
import * as cut from "./transaction";

suite("transaction", () => {
  test("newTransaction", () => {
    const tx = cut.newTransaction();

    tx.dispose();
  });

  test("write/write conflict", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx1 = cut.newTransaction();
    const tx2 = cut.newTransaction();

    try {
      tx1.call(() => {
        got.a = 1;
      });

      tx2.call(() => {
        got.a = 2;
      });

      tx1.commit();

      expect(() => tx2.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx2.dispose();
      tx1.dispose();
    }
  });

  test("write/write conflict outside", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx = cut.newTransaction();

    try {
      tx.call(() => {
        got.a = 1;
      });

      got.a = 2;

      expect(() => tx.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx.dispose();
    }
  });

  test("read/write conflict", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx1 = cut.newTransaction();
    const tx2 = cut.newTransaction();

    try {
      tx1.call(() => {
        got.a = 1;
      });

      tx2.call(() => {
        expect(got.a).toEqual(0);
      });

      tx1.commit();

      expect(() => tx2.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx2.dispose();
      tx1.dispose();
    }
  });

  test("read/write conflict outside", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx = cut.newTransaction();

    try {
      tx.call(() => {
        got.a as void;
      });

      // This write will create a new generation.
      got.a = 2;

      expect(() => tx.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx.dispose();
    }
  });

  test("write/read conflict outside", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx = cut.newTransaction();

    try {
      tx.call(() => {
        got.a = 2;
      });

      // This read isn't tracked.
      got.a as void;

      tx.commit();
    } finally {
      tx.dispose();
    }
  });

  test("enumerate/write conflict", () => {
    const got = newRoot({} as { a?: number });
    const tx1 = cut.newTransaction();
    const tx2 = cut.newTransaction();

    try {
      tx1.call(() => {
        got.a = 1;
      });

      tx2.call(() => {
        expect(Object.keys(got)).toEqual([]);
      });

      tx1.commit();

      expect(() => tx2.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx2.dispose();
      tx1.dispose();
    }
  });

  test("enumerate/dellete conflict", () => {
    const got = newRoot({ a: 42 } as { a?: number });
    const tx1 = cut.newTransaction();
    const tx2 = cut.newTransaction();

    try {
      tx1.call(() => {
        delete got.a;
      });

      tx2.call(() => {
        expect(Object.keys(got)).toEqual(["a"]);
      });

      tx1.commit();

      expect(() => tx2.commit()).toThrowError(cut.TransactionConflictError);
    } finally {
      tx2.dispose();
      tx1.dispose();
    }
  });

  test("write + read", () => {
    const got = newRoot({ a: 0 } as { a: number });
    const tx1 = cut.newTransaction();
    const tx2 = cut.newTransaction();

    try {
      tx1.call(() => {
        got.a = 1;
      });

      tx1.commit();

      tx2.call(() => {
        expect(got.a).toEqual(1);
      });

      tx2.commit();
    } finally {
      tx2.dispose();
      tx1.dispose();
    }
  });
});

suite("inTransaction commit", () => {
  test("set/get", () => {
    const got = newRoot({ a: true } as { a: boolean });

    cut.inTransaction(() => {
      got.a = true;

      expect(got.a).toEqual(true);
    });

    expect(got).toEqual({
      a: true,
    });
  });

  test("keys", () => {
    const got = newRoot({} as { a?: boolean });

    cut.inTransaction(() => {
      got.a = true;

      expect(Object.keys(got)).toEqual(["a"]);
    });
  });

  test("delete/has", () => {
    const got = newRoot({ a: true } as { a?: boolean });

    cut.inTransaction(() => {
      delete got.a;

      expect("a" in got).toBe(false);
    });

    expect(got).toEqual({});
  });

  test("set object", () => {
    const got = newRoot({} as { a?: { b: boolean } });

    cut.inTransaction(() => {
      got.a = { b: true };

      expect(got.a.b).toEqual(true);
    });

    expect(got).toEqual({
      a: { b: true },
    });
  });

  test("set object + set", () => {
    const got = newRoot({} as { a?: { b: boolean } });

    cut.inTransaction(() => {
      got.a = { b: true };
    });

    expect(got).toEqual({
      a: { b: true },
    });

    cut.inTransaction(() => {
      (got.a as { b: boolean }).b = false;
    });

    expect(got).toEqual({
      a: { b: false },
    });
  });

  test("nested", () => {
    const got = newRoot({} as { a?: { b: boolean } });

    cut.inTransaction(() => {
      got.a = { b: true };

      cut.inTransaction(() => {
        (got.a as { b: boolean }).b = false;
      });

      expect(got).toEqual({
        a: { b: false },
      });
    });

    expect(got).toEqual({
      a: { b: false },
    });
  });
});

suite("inTransaction abort", () => {
  test("newRoot object property", () => {
    const got = newRoot({ a: { b: true } } as { a: { b: boolean } });

    expect(() => {
      cut.inTransaction(() => {
        got.a.b = false;
        throw "abort";
      });
    }).toThrow();

    expect(got).toEqual({
      a: { b: true },
    });
  });

  test("set", () => {
    const got = newRoot({ a: true } as { a: boolean });

    expect(() => {
      cut.inTransaction(() => {
        got.a = false;
        throw "abort";
      });
    }).toThrow();

    expect(got).toEqual({
      a: true,
    });
  });

  test("delete", () => {
    const got = newRoot({ a: true } as { a?: boolean });

    expect(() => {
      cut.inTransaction(() => {
        delete got.a;
        throw "abort";
      });
    }).toThrow();

    expect(got).toEqual({
      a: true,
    });
  });

  test("nested outer", () => {
    const got = newRoot({} as { a?: { b: boolean } });

    expect(() => {
      cut.inTransaction(() => {
        got.a = { b: true };

        cut.inTransaction(() => {
          (got.a as { b: boolean }).b = false;
        });

        throw "abort";
      });
    }).toThrow();

    expect(got).toEqual({});
  });

  test("nested inner", () => {
    const got = newRoot({} as { a?: { b: boolean } });

    cut.inTransaction(() => {
      got.a = { b: true };

      expect(() => {
        cut.inTransaction(() => {
          (got.a as { b: boolean }).b = false;

          throw "abort";
        });
      }).toThrow();

      expect(got).toEqual({
        a: { b: true },
      });
    });

    expect(got).toEqual({
      a: { b: true },
    });
  });
});

suite("hooks", () => {
  const origHooks = { ...hooks };
  afterEach(() => {
    Object.assign(hooks, origHooks);
  });

  test("dispose clean", () => {
    hooks.dispose = vi.fn();

    const tx = cut.newTransaction();
    tx.dispose();

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("dispose uncommitted", () => {
    hooks.dispose = vi.fn();

    const root = newRoot({ a: true });
    const tx = cut.newTransaction();
    try {
      tx.call(() => {
        root.a = false;
      });
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ true);
  });

  test("dispose committed", () => {
    hooks.dispose = vi.fn();

    const root = newRoot({ a: true });
    const tx = cut.newTransaction();
    try {
      tx.call(() => {
        root.a = false;
      });
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("dispose committed", () => {
    hooks.dispose = vi.fn();

    const root = newRoot({ a: true });
    const tx = cut.newTransaction();
    try {
      tx.call(() => {
        root.a = false;
      });
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(hooks.dispose).toBeCalledWith(tx, /*uncommitted=*/ false);
  });

  test("enter/leave", () => {
    const leave = vi.fn();
    hooks.enter = vi.fn(() => leave);

    const tx = cut.newTransaction();
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

    const tx = cut.newTransaction();
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

    const root = newRoot({ a: true, b: true } as { a: boolean; b?: boolean });
    const tx = cut.newTransaction();
    try {
      tx.call(() => {
        root.a = false;
        delete root.b;
      });
      tx.commit();
    } finally {
      tx.dispose();
    }

    expect(changes).toEqual([
      {
        type: "setvalue",
        target: root,
        property: "a",
        value: false,
      },
      {
        type: "deletevalue",
        target: root,
        property: "b",
      },
    ]);
  });
});
