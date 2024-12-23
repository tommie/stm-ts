// This is extended for specific types.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TransactionChanges {}

// Some change that happened in the transaction.
export type Change = Values<TransactionChanges>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values<T extends Record<string | symbol, any>, K extends keyof T = keyof T> = K extends any
  ? T[K]
  : never;
