import { afterEach, expect, suite, test, vi } from "vitest";

import { hooks } from "./hooks";
import * as cut from "./root";

suite("wrapRoot", () => {
  test("class", () => {
    class Some {}

    expect(() => cut.wrapRoot(new Some())).toThrow();
  });
});

suite("hooks", () => {
  const origHooks = { ...hooks };
  afterEach(() => {
    Object.assign(hooks, origHooks);
  });

  test("wrapRoot", () => {
    hooks.wrapRoot = vi.fn();

    const want = { a: true } as { a: boolean };
    const got = cut.wrapRoot(want);

    expect(hooks.wrapRoot).toBeCalledWith(want, got);
  });
});
