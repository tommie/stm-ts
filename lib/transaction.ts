import { DeleteValueChange, SetValueChange } from "./change";
import { hooks } from "./hooks";
import { AnyObject, AnyProp, AnyTarget, GENERATION, Generation, proxies } from "./object";

export interface Transaction {
  // Calls the function with this transaction as the current one. Changes to
  // STM-wrapped objects will be queued up and not visible outside these
  // calls until `commit` is invoked. Returns whatever `fun` returns, for
  // convenience. If the function throws an error, the transaction is still
  // alive.
  call<T>(fun: () => T): T;

  // Commits the changes to the underlying target objects. Don't use the
  // transaction after committing.
  commit(): void;

  // Disposes of the transaction. For forwards-compatibility, you must always
  // eventually call this function. If you don't, there will be an error logged
  // in the console when the transaction is garbage collected.
  dispose(): void;
}

// Creates a new transaction for making modifications to any object that has
// been wrapped with `newRoot`. If this is invoked while another transaction is
// current (i.e. inside `Transaction.call` or `inTransaction`,) this becomes a
// nested transaction, and committing it will only make the data visible to the
// outer transaction.
export function newTransaction(): Transaction {
  return new TransactionImpl(++prevGeneration, currentTx);
}

class TransactionImpl implements Transaction {
  private readonly touched = new Map<AnyTarget, Map<AnyProp, Generation | undefined>>();
  private readonly enumerated = new Set<AnyTarget>();
  private uncommitted = new Map<AnyTarget, Map<AnyProp, Value>>();

  public constructor(
    private readonly generation: number,
    private readonly outerTx?: TransactionImpl,
  ) {
    txRegistry.register(
      this,
      [this.uncommitted, new Error("dispose not called on STM transaction")],
      this,
    );
  }

  public dispose() {
    txRegistry.unregister(this);
    hooks.dispose(this, this.uncommitted.size > 0);
  }

  public commit() {
    this.checkConflicts();

    const postCommit = hooks.commit(this, this.changes(), Boolean(this.outerTx));

    try {
      if (this.outerTx) {
        // Merge touched.
        for (const [target, props] of this.touched) {
          for (const [prop] of props) {
            this.outerTx.setTouched(target, prop);
          }
        }

        // Merge uncommitted.
        for (const [target, props] of this.uncommitted) {
          for (const [prop, v] of props) {
            this.outerTx.setValue(target, prop, v);
          }
        }
      } else {
        for (const [target, props] of this.uncommitted) {
          for (const [prop, v] of props) {
            if (isTombstone(v)) delete target[prop];
            else target[prop] = v;

            target[GENERATION].set(prop, this.generation);
          }
        }
      }

      this.uncommitted.clear();
    } finally {
      postCommit?.();
    }
  }

  // Checks the target objects for both read/write and write/write conflicts.
  private checkConflicts() {
    for (const [target, props] of this.touched) {
      for (const [prop, touchedGen] of props) {
        const currentGen = target[GENERATION].get(prop);
        if (currentGen !== touchedGen) {
          throw new TransactionConflictError(target, prop);
        }
      }
    }

    for (const target of this.enumerated) {
      // Only keys in this.touched may exist.
      const props = this.touched.get(target);
      if (!props) {
        if (Object.keys(target).length > 0) {
          throw new TransactionConflictError(target, "Object.entries");
        }

        continue;
      }

      for (const prop of Object.keys(target)) {
        if (!props.has(prop)) {
          throw new TransactionConflictError(target, "Object.entries");
        }
      }
    }
  }

  // Generates all uncommitted changes. We use a generator as a way to
  // lazy-generate the list. If the commit hook doesn't use the changes, we've
  // spent almost no time on it.
  private *changes() {
    for (const [target, props] of this.uncommitted) {
      for (const [property, value] of props) {
        if (isTombstone(value)) {
          yield {
            type: "deletevalue",
            target: proxies.get(target) ?? target,
            property,
          } satisfies DeleteValueChange;
        } else {
          yield {
            type: "setvalue",
            target: proxies.get(target) ?? target,
            property,
            value,
          } satisfies SetValueChange;
        }
      }
    }
  }

  public call<T>(fun: () => T) {
    const prevTx = currentTx;

    try {
      const leave = hooks.enter(this);

      try {
        currentTx = this;
        return fun();
      } finally {
        leave?.();
      }
    } finally {
      currentTx = prevTx;
    }
  }

  // Gets the current value of the target, or TOMBSTONE.
  getValue(target: AnyTarget, prop: AnyProp): Value {
    this.setTouched(target, prop);

    const props = this.uncommitted.get(target);
    if (props) {
      return props.get(prop);
    }

    if (this.outerTx) {
      return this.outerTx.getValue(target, prop);
    }

    return prop in target ? target[prop] : TOMBSTONE;
  }

  // Enumerates the current keys of the target.
  getKeys(target: AnyTarget) {
    let out = Reflect.ownKeys(target).filter((k) => k !== GENERATION);
    const props = this.uncommitted.get(target);
    if (props) {
      const seen = new Set(out);
      const toRemove = new Set<string | symbol>();

      // As long as Map retains insertion order, out should also be in insertion order.
      for (const [k, v] of props) {
        const sk = typeof k === "number" ? String(k) : k;
        if (isTombstone(v)) toRemove.add(sk);
        else if (!seen.has(sk)) out.push(sk);
      }

      out = out.filter((k) => !toRemove.has(k));
      out.forEach((k) => this.setTouched(target, k));
    }

    this.enumerated.add(target);

    return out;
  }

  getPropertyDescriptor(target: AnyTarget, prop: AnyProp) {
    this.setTouched(target, prop);

    const props = this.uncommitted.get(target);
    if (props) {
      const v = props.get(prop);
      if (v) {
        if (isTombstone(v)) return undefined;

        // TODO: handle exotic properties.
        return Object.getOwnPropertyDescriptor({ [prop]: v }, prop);
      }
    }

    return Object.getOwnPropertyDescriptor(target, prop);
  }

  // Records a new value for the property.
  setValue(target: AnyTarget, prop: AnyProp, value: Value) {
    this.setTouched(target, prop);

    let props = this.uncommitted.get(target);
    if (!props) {
      props = new Map();
      this.uncommitted.set(target, props);
    }

    props.set(prop, value);
  }

  // Marks the property as used by the transaction. This is used for both read
  // and write accesses.
  setTouched(target: AnyTarget, prop: AnyProp) {
    let txTarget = this.touched.get(target);
    if (!txTarget) {
      txTarget = new Map();
      this.touched.set(target, txTarget);
    }

    txTarget.set(prop, target[GENERATION].get(prop));
  }
}

export let currentTx: TransactionImpl | undefined;
export let prevGeneration = 0;

export function incrementGeneration() {
  return ++prevGeneration;
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

export const TOMBSTONE = Symbol();
export type Value = any | typeof TOMBSTONE;

export function isTombstone(v: Value): v is typeof TOMBSTONE {
  return v === TOMBSTONE;
}

const txRegistry = new FinalizationRegistry<[Map<AnyObject, any>, Error]>(([uncommitted, err]) => {
  if (uncommitted.size > 0) {
    console.error(err);
  }
});

export class TransactionConflictError extends Error {
  public constructor(
    public readonly target: AnyObject,
    public readonly prop: AnyProp,
  ) {
    super("Transaction conflict");
  }
}
