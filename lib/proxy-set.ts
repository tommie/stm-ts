import { hooks } from "./hooks";
import { AnyTarget, GENERATION, proxies } from "./object";
import { ObjectBufferBase } from "./proxy";
import { setWrapAny, wrapAny } from "./root";
import { currentTx, getGeneration, incrementGeneration, TransactionImpl } from "./transaction";

let inited = false;
export function init() {
  if (inited) return;
  inited = true;

  const origWrapAny = wrapAny;

  setWrapAny((target) => {
    if (target instanceof Set) return newSet(target);

    return origWrapAny(target);
  });
}

const TARGET = Symbol();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySet<T = any> = AnyTarget &
  Set<T> & {
    // Stores the underlying target, which has SetProxy as prototype.
    // This is needed because the SetProxy "this" is the Proxy, not
    // the target itself.
    [TARGET]: Set<T>;
  };

export function newSet<T>(target: Set<T>): AnySet<T> {
  let proxy = proxies.get(target) as AnySet<T>;
  if (proxy !== undefined) return proxy;

  const out = target as AnySet<T>;
  proxy = new Proxy(out, HANDLER);
  proxies.set(target, proxy);

  for (const v of target) {
    const wrapped = wrapAny(v);
    if (wrapped !== v) {
      target.add(wrapped);
      target.delete(v);
    }
  }

  // Using a prototype makes the proxy handler simpler.
  // This must be done after the iteration above, or we'll have "Method called
  // on incompatible receiver."
  Object.setPrototypeOf(target, SetProxy.prototype);

  out[GENERATION] = getGeneration();
  out[TARGET] = target;

  return proxy;
}

const HANDLER: ProxyHandler<AnySet> = {
  get(target, prop) {
    if (prop === TARGET) return target[TARGET];

    if (currentTx) {
      return Reflect.get(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return Reflect.get(target, prop);
  },

  has(target, prop) {
    if (currentTx) {
      return Reflect.has(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return Reflect.has(target, prop);
  },

  getOwnPropertyDescriptor(target, prop) {
    if (currentTx) {
      return Reflect.getOwnPropertyDescriptor(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return Reflect.getOwnPropertyDescriptor(target, prop);
  },

  ownKeys(target) {
    if (currentTx) {
      return Reflect.ownKeys(getBuffer(currentTx, target).getReadValue()).filter(
        (k) => k !== GENERATION && k !== TARGET,
      );
    }

    return Reflect.ownKeys(target).filter((k) => k !== GENERATION && k !== TARGET);
  },

  set(target, prop, value) {
    value = wrapAny(value);

    if (currentTx) {
      return Reflect.set(getBuffer(currentTx, target).getWriteValue(), prop, value);
    }

    const proxy = proxies.get(target) ?? target;
    hooks.change(proxy, () => ({
      type: "setvalue",
      target: proxy,
      property: prop,
      value,
    }));

    target[GENERATION] = incrementGeneration();
    return Reflect.set(target, prop, value);
  },

  deleteProperty(target, prop) {
    if (currentTx) {
      return Reflect.deleteProperty(getBuffer(currentTx, target).getWriteValue(), prop);
    }

    const proxy = proxies.get(target) ?? target;
    hooks.change(proxy, () => ({
      type: "deletevalue",
      target: proxy,
      property: prop,
    }));

    target[GENERATION] = incrementGeneration();
    return Reflect.deleteProperty(target, prop);
  },
};

// We cannot use `super` to call methods, as that results in "Method called
// on incompatible receiver."
class SetProxy<T> extends Set<T> {
  [TARGET]: AnyTarget & Set<T> = undefined as unknown as AnyTarget & Set<T>;

  override add(value: T) {
    if (currentTx) {
      getBuffer(currentTx, this[TARGET]).getWriteValue().add(value);
      return this;
    }

    hooks.change(this as AnySet, () => ({
      type: "addelement",
      target: this,
      value,
    }));

    Set.prototype.add.call(this[TARGET], value);
    return this;
  }

  override clear() {
    if (currentTx) {
      getBuffer(currentTx, this[TARGET]).getWriteValue().clear();
      return;
    }

    hooks.change(this as AnySet, () => ({
      type: "clearelements",
      target: this,
    }));

    Set.prototype.clear.call(this[TARGET]);
  }

  override delete(value: T) {
    if (currentTx) {
      return getBuffer(currentTx, this[TARGET]).getWriteValue().delete(value);
    }

    hooks.change(this as AnySet, () => ({
      type: "deleteelement",
      target: this,
      key: value,
    }));

    return Set.prototype.delete.call(this[TARGET], value);
  }

  override entries() {
    if (currentTx) {
      return Set.prototype.entries.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Set.prototype.entries.call(this[TARGET]);
  }

  override forEach<This = undefined>(
    callbackFn: (this: This, value: T, key: T, set: Set<T>) => void,
    thisArg?: This,
  ) {
    if (currentTx) {
      return Set.prototype.forEach.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        callbackFn,
        thisArg,
      );
    }

    return Set.prototype.forEach.call(this[TARGET], callbackFn, thisArg);
  }

  override has(value: T) {
    if (currentTx) {
      return Set.prototype.has.call(getBuffer(currentTx, this[TARGET]).getReadValue(), value);
    }

    return Set.prototype.has.call(this[TARGET], value);
  }

  override keys() {
    if (currentTx) {
      return Set.prototype.keys.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Set.prototype.keys.call(this[TARGET]);
  }

  override values() {
    if (currentTx) {
      return Set.prototype.values.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Set.prototype.values.call(this[TARGET]);
  }

  override [Symbol.iterator]() {
    if (currentTx) {
      return Set.prototype[Symbol.iterator].call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Set.prototype[Symbol.iterator].call(this[TARGET]);
  }
}

function getBuffer<T>(tx: TransactionImpl, target: AnyTarget & Set<T>) {
  return tx.getBuffer(target, SetBuffer<T>);
}

class SetBuffer<T> extends ObjectBufferBase<AnyTarget & Set<T>, SetChange> {
  override changes(): Iterable<SetChange> {
    if (this.value === this.target) return [];

    return [
      // TODO
    ];
  }

  override commit() {
    if (this.value === this.target) return;

    super.commit();
    this.target[TARGET] = this.target;
    Set.prototype.clear.call(this.target);
    (this.value as Set<T>).forEach((v) => Set.prototype.add.call(this.target, v));
  }

  override mergeInto(target: this) {
    target.touched ??= this.touched;

    if (target.value === target.target) {
      target.value = this.value;
      return;
    }

    super.mergeInto(target);
    Set.prototype.clear.call(target.value);
    (this.value as Set<T>).forEach((v) => Set.prototype.add.call(target.value, v));
  }

  override makeCopy() {
    return new Set(this.target);
  }
}

// A change signaling the addition of a set element.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AddElementChange<T = any> {
  type: "addelement";
  target: Set<T>;
  value: T;
}

// A change signaling the clearing of all set elements.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ClearElementsChange<T = any> {
  type: "clearelements";
  target: T;
}

// A change signaling the deletion of a set element.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DeleteElementChange<T = any, K = any> {
  type: "deleteelement";
  target: T;
  key: K;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SetChange<T = any> = AddElementChange<T> | ClearElementsChange<T> | DeleteElementChange<T>;

declare module "./change" {
  interface TransactionChanges {
    addelement: AddElementChange;
    clearelements: ClearElementsChange;
    deleteelement: DeleteElementChange;
  }
}
