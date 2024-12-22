import { afterEach, expect, suite, test, vi } from "vitest";

import { hooks } from "./hooks";
import * as cut from "./root";

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
