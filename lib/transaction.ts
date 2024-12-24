import { Change } from "./change";
import { hooks } from "./hooks";
import { AnyObject, AnyTarget } from "./object";

export interface Transaction {
  // Calls the function with this transaction as the current one. Changes to
  // STM-wrapped objects will be queued up and not visible outside these
  // calls until `commit` is invoked. Returns whatever `fun` returns, for
  // convenience. If the function throws an error, the transaction is still
  // alive. This is a higher-level interface over `enter()`.
  call<T>(fun: () => T): T;

  // Commits the changes to the underlying target objects. Don't use the
  // transaction after committing.
  commit(): void;

  // Disposes of the transaction. For forwards-compatibility, you must always
  // eventually call this function. If you don't, there will be an error logged
  // in the console when the transaction is garbage collected.
  dispose(): void;

  // Sets this transaction as the current. Returns a function that must be
  // called to leave the transaction. A transaction can be entered and left
  // any number of times. Use try-finally to ensure your code is exception-safe,
  // or use `call()`. The function is re-entrant (i.e. it can be nested.)
  //
  // Note that `await` expressions will relinquish control to the main loop,
  // so you should be really careful when using this function in async
  // functions.
  enter(): () => void;
}

// Creates a new transaction for making modifications to any object that has
// been wrapped with `newRoot`. If this is invoked while another transaction is
// current (i.e. inside `Transaction.call` or `inTransaction`,) this becomes a
// nested transaction, and committing it will only make the data visible to the
// outer transaction.
export function newTransaction(): Transaction {
  const tx = new TransactionImpl(++prevGeneration, currentTx);
  hooks.newTransaction(tx);
  return tx;
}

let prevGeneration = 0;

// Returns the current generation.
export function getGeneration() {
  return prevGeneration;
}

// Increments the generation and returns the new value.
export function incrementGeneration() {
  return ++prevGeneration;
}

export class TransactionImpl implements Transaction {
  private buffers = new Map<AnyTarget, Buffer>();

  public constructor(
    readonly generation: number,
    private readonly outerTx?: TransactionImpl,
  ) {
    txRegistry.register(
      this,
      [this.buffers, new Error("dispose not called on STM transaction")],
      this,
    );
  }

  public dispose() {
    txRegistry.unregister(this);
    hooks.dispose(this, this.buffers.size > 0);
  }

  public commit() {
    if (this.outerTx) {
      for (const [target, buf] of this.buffers) {
        buf.checkMergeableInto(
          this.outerTx.getBuffer(target, buf.constructor as BufferConstructor),
        );
      }
    } else {
      for (const [, buf] of this.buffers) {
        buf.checkCommittable();
      }
    }

    const postCommit = hooks.commit(this, this.changes(), Boolean(this.outerTx));

    try {
      if (this.outerTx) {
        for (const [target, buf] of this.buffers) {
          buf.mergeInto(this.outerTx.getBuffer(target, buf.constructor as BufferConstructor));
        }
      } else {
        for (const [, buf] of this.buffers) {
          buf.commit();
        }
      }

      this.buffers.clear();
    } finally {
      postCommit?.();
    }
  }

  // Generates all uncommitted changes. We use a generator as a way to
  // lazy-generate the list. If the commit hook doesn't use the changes, we've
  // spent almost no time on it.
  private *changes() {
    for (const buf of this.buffers.values()) {
      yield* buf.changes();
    }
  }

  public call<T>(fun: () => T) {
    const leave = this.enter();

    try {
      return fun();
    } finally {
      leave();
    }
  }

  public enter() {
    const prevTx = currentTx;
    const leave = hooks.enter(this);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentTx = this;

    return () => {
      currentTx = prevTx;
      leave?.();
    };
  }

  // Gets the buffer of a target, potentially creating a new one.
  getBuffer<T extends AnyTarget, C extends Change, B extends Buffer<C>>(
    target: T,
    cons: BufferConstructor<T, C, B>,
  ): B {
    let buf = this.buffers.get(target) as B | undefined;
    if (!buf) {
      buf = new cons(target, this, this.outerTx?.getBuffer(target, cons));
      this.buffers.set(target, buf);
    }

    return buf;
  }
}

export let currentTx: TransactionImpl | undefined;

export type BufferConstructor<
  T extends AnyTarget = AnyTarget,
  C extends Change = Change,
  B extends Buffer<C> = Buffer<C>,
> = { new (target: T, tx: TransactionImpl, outer?: B): B };

export abstract class Buffer<C extends Change = Change> {
  // Returns the changes over baseline carried by this buffer.
  abstract changes(): Iterable<C>;

  // Checks this buffer for conflicts with the target. Throws
  // `TransactionConflictError` as appropriate. This is the first phase of
  // the two-phase commit.
  abstract checkCommittable(): void;

  // Checks this buffer for conflicts with the target. Throws
  // `TransactionConflictError` as appropriate. This is the first phase of
  // the two-phase merge.
  abstract checkMergeableInto(target: this): void;

  // Commits the changes in this buffer to the target. If this throws an error,
  // the transaction's targets will be left in an inconsistent state. Ensure
  // that if `checkCommittable()` returns, then so does `commit()`.
  abstract commit(): void;

  // Merges this buffer into the target buffer. This is used to commit into
  // an outer transaction. As with `commit`, if `checkMergeableInto()` returns,
  // then so must this call, or the outer transaction may be left in an
  // inconsistent state.
  abstract mergeInto(target: this): void;
}

// Creates a transaction and uses it to invoke fun. If `fun` throws an
// error, the transaction is aborted, otherwise it is committed.
export function inTransaction<T>(fun: () => T) {
  const tx = newTransaction();

  try {
    const ret = tx.call(fun);

    tx.commit();

    return ret;
  } finally {
    tx.dispose();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txRegistry = new FinalizationRegistry<[Map<AnyObject, any>, Error]>(([uncommitted, err]) => {
  if (uncommitted.size > 0) {
    console.error(err);
  }
});

export class TransactionConflictError extends Error {
  public constructor(public readonly target: AnyObject) {
    super(`Transaction conflict: ${target}`);
  }
}
