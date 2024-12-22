import { expect, suite, test } from "vitest";

import * as cut from "./proxy-array";
import { inTransaction } from "./transaction";

// Runs application functions and expection functions in three difference
// transaction scenarios.
function suites(
  tests: (
    run: <T>(target: T[], apply: () => void, expectApplied: (v: T[]) => void) => void,
  ) => void,
) {
  suite("without transaction", () => {
    tests((target, apply, expectApplied) => {
      apply();
      expectApplied(target);
    });
  });

  suite("inTransaction commit", () => {
    tests((target, apply, expectApplied) => {
      inTransaction(apply);
      expectApplied(target);
    });
  });

  suite("inTransaction abort", () => {
    tests((target, apply, expectApplied) => {
      const orig = [...target];

      expect(() =>
        inTransaction(() => {
          apply();
          expectApplied(target);
          throw "abort";
        }),
      ).toThrow();

      expect(target).toEqual(orig);
    });
  });
}

suites((run) => {
  test("get", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.length).toEqual(1);
        expect(got[0]).toEqual(42);
      },
    );
  });

  test("ownKeys", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(got).toEqual([42]);
      },
    );
  });

  test("set", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {
        got[0] = 43;
      },
      (got) => {
        expect(got).toEqual([43]);
      },
    );
  });

  test("set length", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {
        got.length = 0;
      },
      (got) => {
        expect(got).toEqual([]);
      },
    );
  });

  test("delete", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {
        delete got[0];
      },
      (got) => {
        expect(got).toEqual([undefined]);
      },
    );
  });

  test("at", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.at(0)).toEqual(42);
      },
    );
  });

  test("concat", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.concat([43])).toEqual([42, 43]);
      },
    );
  });

  test("copyWithin", () => {
    const got = cut.newArray([42, 43, 44, 45]);

    run(
      got,
      () => got.copyWithin(1, 2, 3),
      (got) => {
        expect(got).toEqual([42, 44, 44, 45]);
      },
    );
  });

  test("entries", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.entries())).toEqual([[0, 42]]);
      },
    );
  });

  test("every", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.every((v) => v > 40)).toEqual(true);
      },
    );
  });

  test("fill", () => {
    const got = cut.newArray([42, 43, 44]);

    run(
      got,
      () => got.fill(50, 1, 2),
      (got) => {
        expect(got).toEqual([42, 50, 44]);
      },
    );
  });

  test("filter", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.filter((v) => v < 43)).toEqual([42]);
      },
    );
  });

  test("find", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.find((v) => v === 43)).toEqual(43);
      },
    );
  });

  test("findIndex", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.findIndex((v) => v === 43)).toEqual(1);
      },
    );
  });

  test("flat", () => {
    const got = cut.newArray([[42, 43], [44]]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.flat()).toEqual([42, 43, 44]);
      },
    );
  });

  test("flatMap", () => {
    const got = cut.newArray([42, 43, 44]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.flatMap((v, i) => [v, i])).toEqual([42, 0, 43, 1, 44, 2]);
      },
    );
  });

  test("forEach", () => {
    const got = cut.newArray([42, 43, 44]);

    run(
      got,
      () => {},
      (got) => {
        let sum = 0;
        got.forEach((v) => (sum += v));
        expect(sum).toEqual(42 + 43 + 44);
      },
    );
  });

  test("includes", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.includes(43)).toEqual(true);
      },
    );
  });

  test("indexOf", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.indexOf(43)).toEqual(1);
      },
    );
  });

  test("join", () => {
    const got = cut.newArray(["a", "b"]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.join(",")).toEqual("a,b");
      },
    );
  });

  test("keys", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.keys())).toEqual([0]);
      },
    );
  });

  test("lastIndexOf", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.lastIndexOf(43)).toEqual(1);
      },
    );
  });

  test("map", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.map((v) => v + 100)).toEqual([142, 143]);
      },
    );
  });

  test("pop", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {
        expect(got.pop()).toEqual(43);
      },
      (got) => {
        expect(got).toEqual([42]);
      },
    );
  });

  test("push", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {
        got.push(43);
      },
      (got) => {
        expect(got).toEqual([42, 43]);
      },
    );
  });

  test("reduce", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.reduce((acc, v) => acc + v, 1)).toEqual(1 + 42 + 43);
      },
    );
  });

  test("reduceRight", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.reduceRight((acc, v) => acc + v, 1)).toEqual(1 + 42 + 43);
      },
    );
  });

  test("reverse", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {
        got.reverse();
      },
      (got) => {
        expect(got).toEqual([43, 42]);
      },
    );
  });

  test("shift", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {
        expect(got.shift()).toEqual(42);
      },
      (got) => {
        expect(got).toEqual([43]);
      },
    );
  });

  test("slice", () => {
    const got = cut.newArray([42, 43, 44]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.slice(1, 2)).toEqual([43]);
      },
    );
  });

  test("some", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.some((v) => v > 42)).toEqual(true);
      },
    );
  });

  test("sort", () => {
    const got = cut.newArray([43, 42]);

    run(
      got,
      () => {
        got.sort();
      },
      (got) => {
        expect(got).toEqual([42, 43]);
      },
    );
  });

  test("splice", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {
        got.splice(0, 1, 44);
      },
      (got) => {
        expect(got).toEqual([44, 43]);
      },
    );
  });

  test("toLocaleString", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.toLocaleString("en-GB")).toEqual("42,43");
      },
    );
  });

  test("toString", () => {
    const got = cut.newArray([42, 43]);

    run(
      got,
      () => {},
      (got) => {
        expect(got.toString()).toEqual("42,43");
      },
    );
  });

  test("unshift", () => {
    const got = cut.newArray([43]);

    run(
      got,
      () => {
        got.unshift(42);
      },
      (got) => {
        expect(got).toEqual([42, 43]);
      },
    );
  });

  test("values", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.values())).toEqual([42]);
      },
    );
  });

  test("iterator", () => {
    const got = cut.newArray([42]);

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got[Symbol.iterator]())).toEqual([42]);
      },
    );
  });
});
