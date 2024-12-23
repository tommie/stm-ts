import { expect, test } from "vitest";

import * as cut from "./index";

test("import runs initArray", () => {
  const got = cut.wrapRoot([] as number[]);

  expect(() => {
    cut.inTransaction(() => {
      got.push(42);
      throw "abort";
    });
  }).toThrow();

  expect(got).not.toContain(42);
});
