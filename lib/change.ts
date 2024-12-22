export interface TransactionChanges {}

// Some change that happened in the transaction.
export type Change = Values<TransactionChanges>;

type Values<T extends Record<string, any>, K extends keyof T = keyof T> = K extends any
  ? T[K]
  : never;
