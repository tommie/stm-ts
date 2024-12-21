import { Change } from "./change";
import { AnyObject, AnyTarget } from "./object";
import { Transaction } from "./transaction";

// A registry of lifecycle hooks used by transactions. Override hooks by
// storing the current function somewhere and overwrite it with your hook.
// Your hook should call the original hook. Once added, you cannot remove a
// hook, so if you need to disable it, that will have to happen inside your
// hook code.
export const hooks = {
  // Invoked when `newRoot` has created a new root, and its properties have
  // also been wrapped where applicable.
  newRoot(_origTarget: AnyObject, _root: AnyTarget) {},

  // Invoked when the transaction will be committed, after conflicts have
  // been checked. May return a function to be invoked after commit.
  // The changes iterable is only valid until the commit invocation returns.
  // Note that if you consume the changes, you have to save a copy so you can
  // pass it along to the original commit hook.
  commit(_tx: Transaction, _changes: Iterable<Change>, _nested: boolean): (() => void) | void {},

  // Invoked when the transaction is being disposed.
  dispose(_tx: Transaction, _uncommitted: boolean) {},

  // Invoked when the transaction becomes the current transaction. May return
  // a function to be invoked when the transaction is left. Nested transactions
  // will have the leave function called while unnesting, not when
  // the sub-transaction is entered.
  enter(_tx: Transaction): (() => void) | void {},
};
