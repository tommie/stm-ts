import { AnyProp, AnyTarget } from "./object";

// A change signaling the replacement of a property value.
export interface DeleteValueChange {
  type: "deletevalue";
  target: AnyTarget;
  property: AnyProp;
}

// A change signaling the replacement of a property value.
export interface SetValueChange<T = any> {
  type: "setvalue";
  target: AnyTarget;
  property: AnyProp;
  value: T;
}

// Some change that happened in the transaction.
export type Change = DeleteValueChange | SetValueChange;
