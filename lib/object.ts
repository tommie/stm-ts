import "./change";

export type AnyProp = number | string | symbol;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<AnyProp, any>;
export type AnyTarget = AnyObject & {
  // The current generation of the object. This is present even for properties
  // that have been deleted.
  [GENERATION]: Generation;
};

export const GENERATION = Symbol();
export type Generation = number;

export function isTarget(v: AnyObject): v is AnyTarget {
  return GENERATION in v;
}

export const proxies = new WeakMap<AnyObject, AnyTarget>();

// A change signaling the replacement of a property value.
export interface DeleteValueChange {
  type: "deletevalue";
  target: AnyTarget;
  property: AnyProp;
}

// A change signaling the replacement of a property value.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SetValueChange<T = any> {
  type: "setvalue";
  target: AnyTarget;
  property: AnyProp;
  value: T;
}

declare module "./change" {
  interface TransactionChanges {
    deletevalue: DeleteValueChange;
    setvalue: SetValueChange;
  }
}
