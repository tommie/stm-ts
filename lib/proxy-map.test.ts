import { expect, test } from "vitest";

import * as cut from "./proxy-map";
import { suites } from "./testutil";

suites((run) => {
  test("clear", () => {
    const got = cut.newMap(new Map([[42, "hello"]]));

    run(
      got,
      () => {
        got.clear();
      },
      (got) => {
        expect(got).toEqual(new Map());
      },
    );
  });

  test("delete", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {
        got.delete(43);
      },
      (got) => {
        expect(got).toEqual(new Map([[42, "hello"]]));
      },
    );
  });

  test("entries", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.entries())).toEqual([
          [42, "hello"],
          [43, "world"],
        ]);
      },
    );
  });

  test("forEach", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, " world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        let sum = "";
        got.forEach((v) => (sum += v));
        expect(sum).toEqual("hello world");
      },
    );
  });

  test("get", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        expect(got.size).toEqual(2);
        expect(got.get(42)).toEqual("hello");
      },
    );
  });

  test("has", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

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
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.keys())).toEqual([42, 43]);
      },
    );
  });

  test("set", () => {
    const got = cut.newMap(new Map([[42, "hello"]]));

    run(
      got,
      () => {
        got.set(43, "world");
      },
      (got) => {
        expect(got).toEqual(
          new Map([
            [42, "hello"],
            [43, "world"],
          ]),
        );
      },
    );
  });

  test("values", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got.values())).toEqual(["hello", "world"]);
      },
    );
  });

  test("iterator", () => {
    const got = cut.newMap(
      new Map([
        [42, "hello"],
        [43, "world"],
      ]),
    );

    run(
      got,
      () => {},
      (got) => {
        expect(Array.from(got)).toEqual([
          [42, "hello"],
          [43, "world"],
        ]);
      },
    );
  });
});
