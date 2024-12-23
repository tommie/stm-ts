import { expect, test } from "vitest";

import * as cut from "./proxy-set";
import { suites } from "./testutil";

suites((run) => {
  test("add", () => {
    const got = cut.newSet(new Set([42]));

    run(
      got,
      () => {
        got.add(43);
      },
      (got) => {
        expect(got).toEqual(new Set([42, 43]));
      },
    );
  });

  test("clear", () => {
    const got = cut.newSet(new Set([42]));

    run(
      got,
      () => {
        got.clear();
      },
      (got) => {
        expect(got).toEqual(new Set());
      },
    );
  });

  test("delete", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {
        got.delete(43);
      },
      (got) => {
        expect(got).toEqual(new Set([42]));
      },
    );
  });

  test("entries", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.entries())).toEqual([
          [42, 42],
          [43, 43],
        ]);
      },
    );
  });

  test("forEach", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        let sum = 0;
        got.forEach((v) => (sum += v));
        expect(sum).toEqual(42 + 43);
      },
    );
  });

  test("has", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        expect(got.size).toEqual(2);
        expect(got.has(42)).toEqual(true);
      },
    );
  });

  test("keys", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.keys())).toEqual([42, 43]);
      },
    );
  });

  test("values", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.values())).toEqual([42, 43]);
      },
    );
  });

  test("iterator", () => {
    const got = cut.newSet(new Set([42, 43]));

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got)).toEqual([42, 43]);
      },
    );
  });
});
