import { expect, suite } from "vitest";

import { inTransaction } from "./transaction";

expect.addEqualityTesters([
  (a, b) => {
    if (!(a instanceof Set) || !(b instanceof Set)) return undefined;

    for (const aa of a) {
      if (!b.has(aa)) return false;
    }

    for (const bb of b) {
      if (!a.has(bb)) return false;
    }

    return true;
  },
  (a, b) => {
    if (!(a instanceof Map) || !(b instanceof Map)) return undefined;

    for (const [k, v] of a) {
      if (!b.has(k) || b.get(k) !== v) return false;
    }

    for (const [k, v] of b) {
      if (!a.has(k) || a.get(k) !== v) return false;
    }

    return true;
  },
]);

// Runs application functions and expection functions in three difference
// transaction scenarios.
export function suites(
  tests: (run: <T>(target: T, apply: () => void, expectApplied: (v: T) => void) => void) => void,
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
      const orig = makeCopy(target);

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

function makeCopy<T>(value: T) {
  if (Array.isArray(value)) return [...value];
  if (value instanceof Set) return new Set(value);
  if (value instanceof Map) return new Map(value);

  return JSON.parse(JSON.stringify(value));
}
