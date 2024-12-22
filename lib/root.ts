import { hooks } from "./hooks";
import { AnyObject, AnyTarget } from "./object";
import { newObject } from "./proxy";

// Wraps the target object in an STM proxy. Properties are recursively
// wrapped. Objects that have already been wrapped return the existing
// wrapper, making the function idempotent and safe for cyclic data
// structures.
//
// After wrapping, you must not use the target object; only the returned
// wrapper. Even just reading directly from the target object will
// interfere with conflict detection.
export function newRoot<T extends AnyObject>(target: T): AnyTarget {
  const proxy = wrapAny(target) as AnyTarget;
  hooks.newRoot(target, proxy);
  return proxy;
}

export let wrapAny = function wrapAny<T>(target: T): T {
  if (typeof target === "object") return newObject(target as AnyObject);

  return target;
};

// Extension point for custom object types. This is here to break
// the cyclic dependency in that all modules want the "high level"
// wrapAny, but they also want to provide a value for it.
export function setWrapAny(fun: typeof wrapAny) {
  wrapAny = fun;
}
