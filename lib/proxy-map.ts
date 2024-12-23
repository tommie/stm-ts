import { hooks } from "./hooks";
import { AnyTarget, GENERATION, proxies } from "./object";
import { ObjectBufferBase } from "./proxy";
import { ClearElementsChange, DeleteElementChange } from "./proxy-set";
import { setWrapAny, wrapAny } from "./root";
import { currentTx, getGeneration, incrementGeneration, TransactionImpl } from "./transaction";

let inited = false;
export function init() {
  if (inited) return;
  inited = true;

  const origWrapAny = wrapAny;

  setWrapAny((target) => {
    if (target instanceof Map) return wrapMap(target);

    return origWrapAny(target);
  });
}

const TARGET = Symbol();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMap<K = any, V = any> = AnyTarget &
  Map<K, V> & {
    // Stores the underlying target, which has SetProxy as prototype.
    // This is needed because the SetProxy "this" is the Proxy, not
    // the target itself.
    [TARGET]: Map<K, V>;
  };

export function wrapMap<K, V>(target: Map<K, V>): AnyMap<K, V> {
  let proxy = proxies.get(target) as AnyMap<K, V>;
  if (proxy !== undefined) return proxy;

  const out = target as AnyMap<K, V>;
  proxy = new Proxy(out, HANDLER);
  proxies.set(target, proxy);

  for (const [k, v] of target) {
    const wrapped = wrapAny(v);
    if (wrapped !== v) {
      target.set(k, wrapped);
      target.delete(k);
    }
  }

  // Using a prototype makes the proxy handler simpler.
  // This must be done after the iteration above, or we'll have "Method called
  // on incompatible receiver."
  Object.setPrototypeOf(target, MapProxy.prototype);

  out[GENERATION] = getGeneration();
  out[TARGET] = target;

  return proxy;
}

// When a method resolution occurs, we need to always return target[prop]:
// the receiver will be the proxy, so we cannot use that if
// tx.value !== tx.target, since that's a straight Map. This only mattesr
// for `get`.
const NATIVE_PROPS = new Set(Reflect.ownKeys(Map.prototype));

const HANDLER: ProxyHandler<AnyMap> = {
  get(target, prop) {
    if (currentTx && !NATIVE_PROPS.has(prop)) {
      if (prop === TARGET) return target[TARGET];

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
class MapProxy<K, V> extends Map<K, V> {
  [TARGET]: AnyMap<K, V> = undefined as unknown as AnyMap<K, V>;

  override clear() {
    if (currentTx) {
      getBuffer(currentTx, this[TARGET]).getWriteValue().clear();
      return;
    }

    hooks.change(this as AnyMap, () => ({
      type: "clearelements",
      target: this,
    }));

    Map.prototype.clear.call(this[TARGET]);
  }

  override delete(key: K) {
    if (currentTx) {
      return getBuffer(currentTx, this[TARGET]).getWriteValue().delete(key);
    }

    hooks.change(this as AnyMap, () => ({
      type: "deleteelement",
      target: this,
      key,
    }));

    return Map.prototype.delete.call(this[TARGET], key);
  }

  override entries() {
    if (currentTx) {
      return Map.prototype.entries.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Map.prototype.entries.call(this[TARGET]);
  }

  override forEach<This = undefined>(
    callbackFn: (this: This, value: V, key: K, set: Map<K, V>) => void,
    thisArg?: This,
  ) {
    if (currentTx) {
      return Map.prototype.forEach.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        callbackFn,
        thisArg,
      );
    }

    return Map.prototype.forEach.call(this[TARGET], callbackFn, thisArg);
  }

  override get(key: K) {
    if (currentTx) {
      return Map.prototype.get.call(getBuffer(currentTx, this[TARGET]).getReadValue(), key);
    }

    return Map.prototype.get.call(this[TARGET], key);
  }

  override has(key: K) {
    if (currentTx) {
      return Map.prototype.has.call(getBuffer(currentTx, this[TARGET]).getReadValue(), key);
    }

    return Map.prototype.has.call(this[TARGET], key);
  }

  override keys() {
    if (currentTx) {
      return Map.prototype.keys.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Map.prototype.keys.call(this[TARGET]);
  }

  override set(key: K, value: V) {
    if (currentTx) {
      getBuffer(currentTx, this[TARGET]).getWriteValue().set(key, value);
      return this;
    }

    hooks.change(this as AnyMap, () => ({
      type: "setelement",
      target: this,
      key,
      value,
    }));

    Map.prototype.set.call(this[TARGET], key, value);
    return this;
  }

  override values() {
    if (currentTx) {
      return Map.prototype.values.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Map.prototype.values.call(this[TARGET]);
  }

  override [Symbol.iterator]() {
    if (currentTx) {
      return Map.prototype[Symbol.iterator].call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return Map.prototype[Symbol.iterator].call(this[TARGET]);
  }
}

function getBuffer<K, V>(tx: TransactionImpl, target: AnyMap<K, V>) {
  return tx.getBuffer(target, MapBuffer<K, V>);
}

class MapBuffer<K, V> extends ObjectBufferBase<AnyMap<K, V>, MapChange> {
  override changes(): Iterable<MapChange> {
    if (this.value === this.target) return [];

    return [
      // TODO
    ];
  }

  override commit() {
    if (this.value === this.target) return;

    super.commit();
    this.target[TARGET] = this.target;
    Map.prototype.clear.call(this.target);
    (this.value as Map<K, V>).forEach((v, k) => Map.prototype.set.call(this.target, k, v));
  }

  override mergeInto(target: this) {
    if (this.value === target.value) return;

    target.touched ??= this.touched;

    if (target.value === target.target) {
      target.value = this.value;
      return;
    }

    super.mergeInto(target);
    Map.prototype.clear.call(target.value);
    (this.value as Map<K, V>).forEach((v, k) => Map.prototype.set.call(target.value, k, v));
  }

  override makeCopy() {
    return new Map(this.target);
  }
}

// A change signaling the addition of a set element.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SetElementChange<K = any, V = any> {
  type: "setelement";
  target: Map<K, V>;
  key: K;
  value: V;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapChange<K = any, V = any> =
  | SetElementChange<K, V>
  | ClearElementsChange<Map<K, V>>
  | DeleteElementChange<Map<K, V>, K>;

declare module "./change" {
  interface TransactionChanges {
    setelement: SetElementChange;
    clearelements: ClearElementsChange;
    deleteelement: DeleteElementChange;
  }
}
