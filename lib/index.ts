import { init as initArray } from "./proxy-array";
import { init as initSet } from "./proxy-set";

export type { Change, TransactionChanges } from "./change";
export { hooks } from "./hooks";
export type { AnyObject, AnyProp, DeleteValueChange, SetValueChange } from "./object";
export { newRoot } from "./root";
export { inTransaction, newTransaction, TransactionConflictError } from "./transaction";
export type { Transaction } from "./transaction";

initArray();
initSet();
