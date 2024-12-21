import { hooks } from "./hooks";
import { AnyObject, AnyTarget, GENERATION, proxies } from "./object";
import { currentTx, incrementGeneration, isTombstone, TOMBSTONE } from "./transaction";

// Wraps the target object in an STM proxy. Properties are recursively
// wrapped. Objects that have already been wrapped return the existing
// wrapper, making the function idempotent and safe for cyclic data
// structures.
//
// After wrapping, you must not use the target object; only the returned
// wrapper. Even just reading directly from the target object will
// interfere with conflict detection.
export function newRoot<T extends AnyObject>(target: T): AnyTarget {
  let proxy = proxies.get(target);
  if (proxy !== undefined) return proxy;

  const out = target as AnyTarget;
  proxy = new Proxy(out, HANDLER);
  proxies.set(target, proxy);

  for (const [k, v] of Object.entries(target) as Iterable<[keyof T, T[keyof T]]>) {
    if (typeof v === "object") target[k] = newRoot(v) as T[keyof T];
  }

  out[GENERATION] = new Map();

  hooks.newRoot(target, proxy);

  return proxy;
}

const HANDLER: ProxyHandler<AnyTarget> = {
  get(target, prop) {
    if (currentTx) {
      const v = currentTx.getValue(target, prop);
      if (isTombstone(v)) return undefined;

      return v;
    }

    return target[prop];
  },

  has(target, prop) {
    if (currentTx) {
      const v = currentTx.getValue(target, prop);
      if (isTombstone(v)) return false;

      return true;
    }

    return prop in target;
  },

  getOwnPropertyDescriptor(target, prop) {
    if (currentTx) {
      return currentTx.getPropertyDescriptor(target, prop);
    }

    return Object.getOwnPropertyDescriptor(target, prop);
  },

  ownKeys(target) {
    if (currentTx) {
      return currentTx.getKeys(target);
    }

    return Reflect.ownKeys(target).filter((k) => k !== GENERATION);
  },

  set(target, prop, value) {
    if (typeof value === "object") {
      value = newRoot(value);
    }

    if (currentTx) {
      currentTx.setValue(target, prop, value);
      return true;
    }

    hooks.change({
      type: "setvalue",
      target: proxies.get(target) ?? target,
      property: prop,
      value,
    });

    target[GENERATION].set(prop, incrementGeneration());
    target[prop] = value;
    return true;
  },

  deleteProperty(target, prop) {
    if (currentTx) {
      currentTx.setValue(target, prop, TOMBSTONE);
      return true;
    }

    hooks.change({
      type: "deletevalue",
      target: proxies.get(target) ?? target,
      property: prop,
    });

    target[GENERATION].set(prop, incrementGeneration());
    delete target[prop];
    return true;
  },
};
