export type AnyProp = number | string | symbol;
export type AnyObject = Record<AnyProp, any>;
export type AnyTarget = AnyObject & {
  // The current generation of the value. This is present even for properties
  // that have been deleted.
  [GENERATION]: Map<AnyProp, Generation>;
};

export const GENERATION = Symbol();
export type Generation = number;

export const proxies = new WeakMap<AnyObject, AnyTarget>();
