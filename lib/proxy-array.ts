import { hooks } from "./hooks";
import {
  AnyTarget,
  DeleteValueChange,
  GENERATION,
  isTarget,
  proxies,
  SetValueChange,
} from "./object";
import { ObjectBufferBase } from "./proxy";
import { setWrapAny, wrapAny } from "./root";
import { currentTx, getGeneration, incrementGeneration, TransactionImpl } from "./transaction";

let inited = false;
export function init() {
  if (inited) return;
  inited = true;

  const origWrapAny = wrapAny;

  setWrapAny((target) => {
    if (Array.isArray(target)) return newArray(target);

    return origWrapAny(target);
  });
}

const TARGET = Symbol();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArray<T = any> = AnyTarget &
  T[] & {
    // Stores the underlying target, which has ArrayProxy as prototype.
    // This is needed because the ArrayProxy "this" is the Proxy, not
    // the target itself.
    [TARGET]: T[];
  };

export function newArray<T>(target: T[]): AnyArray<T> {
  let proxy = proxies.get(target) as AnyArray;
  if (proxy !== undefined) return proxy;

  const out = target as AnyArray;
  proxy = new Proxy(out, HANDLER);
  proxies.set(target, proxy);

  for (let i = 0; i < target.length; ++i) {
    target[i] = wrapAny(target[i]);
  }

  // Using a prototype makes the proxy handler simpler.
  Object.setPrototypeOf(target, ArrayProxy.prototype);

  out[GENERATION] = getGeneration();
  out[TARGET] = target;

  return proxy;
}

const HANDLER: ProxyHandler<AnyArray> = {
  get(target, prop) {
    if (prop === TARGET) return target[prop];

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

class ArrayProxy<T> extends Array<T> {
  [TARGET]: AnyTarget & T[] = undefined as unknown as AnyTarget & T[];

  override at(i: number) {
    if (currentTx) {
      return Array.prototype.at.call(getBuffer(currentTx, this[TARGET]).getReadValue(), i);
    }

    return super.at(i);
  }

  override concat(...arrs: ConcatArray<T>[]) {
    if (currentTx) {
      const tx = currentTx;
      return withoutTargetProps(
        Array.prototype.concat.call(
          getBuffer(tx, this[TARGET]).getReadValue(),
          ...arrs.map((arr) => (!isTarget(arr) ? arr : getBuffer(tx, arr[TARGET]).getReadValue())),
        ),
      );
    }

    return withoutTargetProps(super.concat(...arrs));
  }

  override copyWithin(target: number, start: number, end?: number) {
    if (currentTx) {
      const tx = currentTx;
      Array.prototype.copyWithin.call(
        getBuffer(tx, this[TARGET]).getWriteValue(),
        target,
        start,
        end,
      );
      return this;
    }

    end ??= this.length;
    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start: target,
      deleteCount: end - start,
      newItems: this[TARGET].slice(start, end),
    }));

    return super.copyWithin(target, start, end);
  }

  override entries() {
    if (currentTx) {
      const tx = currentTx;
      return Array.prototype.entries.call(getBuffer(tx, this[TARGET]).getReadValue());
    }

    return super.entries();
  }

  override every<S extends T>(
    predicate: (value: T, index: number, array: T[]) => value is S,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any,
  ): this is S[] {
    if (currentTx) {
      const tx = currentTx;
      return Array.prototype.every.call(
        getBuffer(tx, this[TARGET]).getReadValue(),
        predicate,
        thisArg,
      );
    }

    return super.every(predicate, thisArg);
  }

  override fill(value: T, start?: number, end?: number) {
    value = wrapAny(value);

    if (currentTx) {
      const tx = currentTx;
      Array.prototype.fill.call(getBuffer(tx, this[TARGET]).getWriteValue(), value, start, end);
      return this;
    }

    start ??= 0;
    end ??= this.length;
    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start,
      deleteCount: end - start,
      newItems: this[TARGET].slice(start, end),
    }));

    return super.fill(value, start, end);
  }

  override filter<S extends T, This = undefined>(
    predicate: (this: This, value: T, index: number, array: T[]) => value is S,
    thisArg?: This,
  ) {
    if (currentTx) {
      return withoutTargetProps(
        Array.prototype.filter.call(
          getBuffer(currentTx, this[TARGET]).getReadValue(),
          predicate,
          thisArg,
        ),
      );
    }

    return withoutTargetProps(super.filter(predicate, thisArg));
  }

  override find<S extends T, This = undefined>(
    predicate: (this: This, value: T, index: number, array: T[]) => value is S,
    thisArg?: This,
  ) {
    if (currentTx) {
      return Array.prototype.find.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        predicate,
        thisArg,
      );
    }

    return super.find(predicate, thisArg);
  }

  override findIndex<S extends T, This = undefined>(
    predicate: (this: This, value: T, index: number, array: T[]) => value is S,
    thisArg?: This,
  ) {
    if (currentTx) {
      return Array.prototype.findIndex.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        predicate,
        thisArg,
      );
    }

    return super.findIndex(predicate, thisArg);
  }

  override flat<A, D extends number = 1>(depth?: D | undefined) {
    if (currentTx) {
      return withoutTargetProps(
        Array.prototype.flat.call(
          getBuffer(currentTx, this[TARGET]).getReadValue(),
          depth,
        ) as FlatArray<A, D>[],
      );
    }

    return withoutTargetProps(super.flat(depth) as FlatArray<A, D>[]);
  }

  override flatMap<U, This = undefined>(
    callbackFn: (this: This, value: T, index: number, array: T[]) => U | readonly U[],
    thisArg?: This,
  ) {
    if (currentTx) {
      return withoutTargetProps(
        Array.prototype.flatMap.call<
          this,
          [(this: This, value: T, index: number, array: T[]) => U | readonly U[], This | undefined],
          U[]
        >(getBuffer(currentTx, this[TARGET]).getReadValue(), callbackFn, thisArg),
      );
    }

    return withoutTargetProps(super.flatMap(callbackFn, thisArg));
  }

  override forEach<This = undefined>(
    callbackFn: (this: This, value: T, index: number, array: T[]) => void,
    thisArg?: This,
  ) {
    if (currentTx) {
      return Array.prototype.forEach.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        callbackFn,
        thisArg,
      );
    }

    return super.forEach(callbackFn, thisArg);
  }

  override includes(searchElement: T, fromIndex?: number) {
    if (currentTx) {
      return Array.prototype.includes.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        searchElement,
        fromIndex,
      );
    }

    return super.includes(searchElement, fromIndex);
  }

  override indexOf(searchElement: T, fromIndex?: number) {
    if (currentTx) {
      return Array.prototype.indexOf.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        searchElement,
        fromIndex,
      );
    }

    return super.indexOf(searchElement, fromIndex);
  }

  override join(separator?: string) {
    if (currentTx) {
      return Array.prototype.join.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        separator,
      );
    }

    return super.join(separator);
  }

  override keys() {
    if (currentTx) {
      return Array.prototype.keys.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return super.keys();
  }

  override lastIndexOf(searchElement: T, fromIndex?: number) {
    if (currentTx) {
      if (fromIndex === undefined) {
        // Passing fromIndex == undefined means 0.
        return Array.prototype.lastIndexOf.call(
          getBuffer(currentTx, this[TARGET]).getReadValue(),
          searchElement,
        );
      }

      return Array.prototype.lastIndexOf.call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
        searchElement,
        fromIndex,
      );
    }

    if (fromIndex === undefined) {
      // Passing fromIndex == undefined means 0.
      return super.lastIndexOf(searchElement);
    }

    return super.lastIndexOf(searchElement, fromIndex);
  }

  override map<U, This = undefined>(
    callbackFn: (this: This, value: T, index: number, array: T[]) => U,
    thisArg?: This,
  ) {
    if (currentTx) {
      return withoutTargetProps(
        Array.prototype.map.call(
          getBuffer(currentTx, this[TARGET]).getReadValue(),
          callbackFn,
          thisArg,
        ) as U[],
      );
    }

    return withoutTargetProps(super.map(callbackFn, thisArg));
  }

  override pop() {
    if (currentTx) {
      return Array.prototype.pop.call(getBuffer(currentTx, this[TARGET]).getWriteValue());
    }

    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start: this.length - 1,
      deleteCount: 1,
      newItems: [],
    }));

    return super.pop();
  }

  override push(...items: T[]) {
    items = items.map((v) => wrapAny(v));

    if (currentTx) {
      return Array.prototype.push.call(
        getBuffer(currentTx, this[TARGET]).getWriteValue(),
        ...items,
      );
    }

    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start: this.length - 1,
      deleteCount: 0,
      newItems: items,
    }));

    return super.push(...items);
  }

  override reduce(
    callbackFn: (accumulator: T, currentValue: T, currentIndex: number, array: T[]) => T,
  ): T;
  override reduce<U>(
    callbackFn: (accumulator: U, currentValue: T, currentIndex: number, array: T[]) => U,
    initialValue: U,
  ): U;
  override reduce<U>(
    callbackFn: (accumulator: U | T, currentValue: T, currentIndex: number, array: T[]) => U | T,
    initialValue?: U | T,
  ) {
    if (currentTx) {
      return Array.prototype.reduce.call<
        T[],
        [
          (accumulator: U | T, currentValue: T, currentIndex: number, array: T[]) => U | T,
          U | T | undefined,
        ],
        U
      >(getBuffer(currentTx, this[TARGET]).getReadValue() as T[], callbackFn, initialValue);
    }

    // TODO: why is reduce typing broken?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return super.reduce(callbackFn as any, initialValue);
  }

  override reduceRight(
    callbackFn: (accumulator: T, currentValue: T, currentIndex: number, array: T[]) => T,
  ): T;
  override reduceRight<U>(
    callbackFn: (accumulator: U, currentValue: T, currentIndex: number, array: T[]) => U,
    initialValue: U,
  ): U;
  override reduceRight<U>(
    callbackFn: (accumulator: U | T, currentValue: T, currentIndex: number, array: T[]) => U | T,
    initialValue?: U | T,
  ) {
    if (currentTx) {
      return Array.prototype.reduceRight.call<
        T[],
        [
          (accumulator: U | T, currentValue: T, currentIndex: number, array: T[]) => U | T,
          U | T | undefined,
        ],
        U
      >(getBuffer(currentTx, this[TARGET]).getReadValue() as T[], callbackFn, initialValue);
    }

    // TODO: why is reduceRight typing broken?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return super.reduceRight(callbackFn as any, initialValue);
  }

  override reverse() {
    if (currentTx) {
      return Array.prototype.reverse.call(getBuffer(currentTx, this[TARGET]).getWriteValue());
    }

    hooks.change(this as AnyArray, () => ({
      type: "reverse",
      target: this as AnyArray,
    }));

    return super.reverse();
  }

  override shift() {
    if (currentTx) {
      return Array.prototype.shift.call(getBuffer(currentTx, this[TARGET]).getWriteValue());
    }

    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start: 0,
      deleteCount: 1,
      newItems: [],
    }));

    return super.shift();
  }

  override slice(start?: number, end?: number) {
    if (currentTx) {
      const tx = currentTx;
      return withoutTargetProps(
        Array.prototype.slice.call(getBuffer(tx, this[TARGET]).getReadValue(), start, end),
      );
    }

    return withoutTargetProps(super.slice(start, end));
  }

  override some<S extends T>(
    predicate: (value: T, index: number, array: T[]) => value is S,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any,
  ) {
    if (currentTx) {
      const tx = currentTx;
      return Array.prototype.some.call(
        getBuffer(tx, this[TARGET]).getReadValue(),
        predicate,
        thisArg,
      );
    }

    return super.some(predicate, thisArg);
  }

  override sort(compareFn?: ((a: T, b: T) => number) | undefined) {
    if (currentTx) {
      Array.prototype.sort.call(getBuffer(currentTx, this[TARGET]).getWriteValue(), compareFn);
      return this;
    }

    hooks.change(this as AnyArray, () => ({
      type: "sort",
      target: this as AnyArray,
    }));

    return super.sort(compareFn);
  }

  override splice(start: number, deleteCount: number, ...items: T[]) {
    items = items.map((v) => wrapAny(v));

    if (currentTx) {
      return Array.prototype.splice.call(
        getBuffer(currentTx, this[TARGET]).getWriteValue(),
        start,
        deleteCount,
        ...items,
      );
    }

    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start,
      deleteCount,
      newItems: items,
    }));

    return super.splice(start, deleteCount, ...items);
  }

  override toLocaleString(
    locales?: string | string[],
    options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions,
  ): string {
    if (currentTx) {
      const tx = currentTx;
      if (locales === undefined) {
        return Array.prototype.toLocaleString.call<this, [], string>(
          getBuffer(tx, this[TARGET]).getReadValue(),
        );
      }

      return Array.prototype.toLocaleString.call(
        getBuffer(tx, this[TARGET]).getReadValue(),
        locales,
        options,
      );
    }

    return locales === undefined ? super.toLocaleString() : super.toLocaleString(locales, options);
  }

  override toString(): string {
    if (currentTx) {
      const tx = currentTx;
      return Array.prototype.toString.call(getBuffer(tx, this[TARGET]).getReadValue());
    }

    return super.toString();
  }

  override unshift(...items: T[]) {
    items = items.map((v) => wrapAny(v));

    if (currentTx) {
      return Array.prototype.unshift.call(
        getBuffer(currentTx, this[TARGET]).getWriteValue(),
        ...items,
      );
    }

    hooks.change(this as AnyArray, () => ({
      type: "splice",
      target: this as AnyArray,
      start: 0,
      deleteCount: 0,
      newItems: items,
    }));

    return super.unshift(...items);
  }

  override values() {
    if (currentTx) {
      return Array.prototype.values.call(getBuffer(currentTx, this[TARGET]).getReadValue());
    }

    return super.values();
  }

  override [Symbol.iterator]() {
    if (currentTx) {
      return Array.prototype[Symbol.iterator].call(
        getBuffer(currentTx, this[TARGET]).getReadValue(),
      );
    }

    return super[Symbol.iterator]();
  }
}

function getBuffer<T>(tx: TransactionImpl, target: AnyTarget & T[]) {
  return tx.getBuffer(target, ArrayBuffer<T>);
}

class ArrayBuffer<T> extends ObjectBufferBase<AnyTarget & T[], ArrayChange> {
  override changes(): Iterable<ArrayChange> {
    if (this.value === this.target) return [];

    return [
      {
        type: "splice",
        target: (proxies.get(this.target) ?? this.target) as AnyArray,
        start: 0,
        deleteCount: this.target.length,
        newItems: this.value.slice(),
      },
    ];
  }

  override commit() {
    if (this.value === this.target) return;

    super.commit();
    this.target.splice(0, this.target.length, ...(this.value as T[]));
  }

  override mergeInto(target: this) {
    if (this.value === target.value) return;

    target.touched ??= this.touched;

    if (target.value === target.target) {
      target.value = this.value;
      return;
    }

    super.mergeInto(target);
    target.value.splice(0, target.value.length, ...(this.value as T[]));
  }

  override makeCopy() {
    return [...this.target];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withoutTargetProps<T extends any[]>(arr: T) {
  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete (arr as Partial<AnyTarget>)[TARGET];
  delete (arr as Partial<AnyTarget>)[GENERATION];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */
  return arr;
}

// A change signaling the reversal of an array.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReverseChange<T extends any[] = any[]> {
  type: "reverse";
  target: T;
}

// A change signaling the sorting of an array.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SortChange<T extends any[] = any[]> {
  type: "sort";
  target: T;
}

// A change signaling the splicing of an array.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SpliceChange<T extends any[] = any[]> {
  type: "splice";
  target: T;
  start: number;
  deleteCount: number;
  newItems: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ArrayChange<T extends any[] = any[]> =
  | DeleteValueChange
  | SetValueChange
  | ReverseChange<T>
  | SortChange<T>
  | SpliceChange<T>;

declare module "./change" {
  interface TransactionChanges {
    reverse: ReverseChange;
    sort: SortChange;
    splice: SpliceChange;
  }
}
