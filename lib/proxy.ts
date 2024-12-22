import { Change } from "./change";
import { hooks } from "./hooks";
import {
  AnyObject,
  AnyTarget,
  DeleteValueChange,
  Generation,
  GENERATION,
  proxies,
  SetValueChange,
} from "./object";
import {
  Buffer,
  currentTx,
  getGeneration,
  incrementGeneration,
  TransactionConflictError,
  TransactionImpl,
} from "./transaction";

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

  out[GENERATION] = getGeneration();

  hooks.newRoot(target, proxy);

  return proxy;
}

const HANDLER: ProxyHandler<AnyTarget> = {
  get(target, prop) {
    if (currentTx) {
      return Reflect.get(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return target[prop];
  },

  has(target, prop) {
    if (currentTx) {
      return Reflect.has(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return prop in target;
  },

  getOwnPropertyDescriptor(target, prop) {
    if (currentTx) {
      return Reflect.getOwnPropertyDescriptor(getBuffer(currentTx, target).getReadValue(), prop);
    }

    return Object.getOwnPropertyDescriptor(target, prop);
  },

  ownKeys(target) {
    if (currentTx) {
      return Reflect.ownKeys(getBuffer(currentTx, target).getReadValue()).filter(
        (k) => k !== GENERATION,
      );
    }

    return Reflect.ownKeys(target).filter((k) => k !== GENERATION);
  },

  set(target, prop, value) {
    if (typeof value === "object") {
      value = newRoot(value);
    }

    if (currentTx) {
      return Reflect.set(getBuffer(currentTx, target).getWriteValue(), prop, value);
    }

    hooks.change({
      type: "setvalue",
      target: proxies.get(target) ?? target,
      property: prop,
      value,
    });

    target[GENERATION] = incrementGeneration();
    return Reflect.set(target, prop, value);
  },

  deleteProperty(target, prop) {
    if (currentTx) {
      return Reflect.deleteProperty(getBuffer(currentTx, target).getWriteValue(), prop);
    }

    hooks.change({
      type: "deletevalue",
      target: proxies.get(target) ?? target,
      property: prop,
    });

    target[GENERATION] = incrementGeneration();
    return Reflect.deleteProperty(target, prop);
  },
};

function getBuffer<T extends AnyTarget>(tx: TransactionImpl, target: T) {
  return tx.getBuffer(target, ObjectBuffer<T>);
}

export abstract class ObjectBufferBase<T extends AnyTarget, C extends Change> extends Buffer<C> {
  protected touched: Generation | undefined;
  protected value: Omit<T, typeof GENERATION>;

  constructor(
    protected readonly target: T,
    protected readonly tx: Pick<TransactionImpl, "generation">,
    outer?: ObjectBuffer<T>,
  ) {
    super();

    this.value = outer ? outer.value : target;
  }

  override checkCommittable() {
    if (this.touched === undefined) return;

    if (this.target[GENERATION] !== this.touched) {
      throw new TransactionConflictError(proxies.get(this.target) ?? this.target);
    }
  }

  override checkMergeableInto(target: this) {
    if (this.touched === undefined) return;

    if (target.touched !== undefined) {
      if (target.value === target.target) {
        // The target has only read.
        if (target.touched !== this.touched) {
          throw new TransactionConflictError(proxies.get(this.target) ?? this.target);
        }
      } else {
        throw new TransactionConflictError(proxies.get(this.target) ?? this.target);
      }
    } else {
      this.checkCommittable();
    }
  }

  override commit() {
    if (this.value === this.target) return;

    for (const prop of Reflect.ownKeys(this.target)) {
      if (!Reflect.has(this.value, prop)) {
        delete this.target[prop];
      }
    }

    Object.assign(this.target, this.value);
    this.target[GENERATION] = this.tx.generation;
  }

  override mergeInto(target: this) {
    target.touched ??= this.touched;

    if (target.value === target.target) {
      target.value = this.value;
      return;
    }

    for (const prop of Reflect.ownKeys(target.value)) {
      if (!Reflect.has(target.value, prop)) {
        delete target.value[prop];
      }
    }

    Object.assign(target.value, this.value);
  }

  getReadValue(): Readonly<Omit<T, typeof GENERATION>> {
    this.setTouched();

    return this.value;
  }

  getWriteValue() {
    this.setTouched();

    if (this.value === this.target) {
      this.value = this.makeCopy();
    }

    return this.value;
  }

  setTouched() {
    this.touched = this.target[GENERATION];
  }

  // Called the first time the target is written to. Should create a shallow
  // copy without the metadata used by the proxy, and not wrapped in a proxy.
  abstract makeCopy(): Omit<T, typeof GENERATION>;
}

export class ObjectBuffer<T extends AnyTarget> extends ObjectBufferBase<
  T,
  DeleteValueChange | SetValueChange
> {
  override changes(): Iterable<DeleteValueChange | SetValueChange> {
    const out: (DeleteValueChange | SetValueChange)[] = [];

    for (const property of Reflect.ownKeys(this.target)) {
      if (property === GENERATION) continue;

      if (!Reflect.has(this.value, property)) {
        out.push({
          type: "deletevalue",
          target: proxies.get(this.target) ?? this.target,
          property,
        });
      }
    }

    for (const property of Reflect.ownKeys(this.value)) {
      const value = this.value[property];
      if (this.target[property] === value) continue;

      out.push({
        type: "setvalue",
        target: proxies.get(this.target) ?? this.target,
        property,
        value,
      });
    }

    return out;
  }

  override makeCopy() {
    const { [GENERATION]: _, ...value } = this.target;
    Reflect.setPrototypeOf(value, Reflect.getPrototypeOf(this.target));
    return value;
  }
}
