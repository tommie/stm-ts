# Software Transactional Memory for TypeScript

This library provides an STM primitive for TypeScript, simplifying the case where you need to make many small changes to TypeScript data and either commit or roll back.

## Features

- Simple interface that uses [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy) objects to transparently wrap objects.
- Support for objects, nested objects, and cyclic data structures.
- Support for nested transactions.
- Supports Array, Map, and Set natively.
- Hooks for extending the functionality.
- Provides a list of changes for creating logs, transmitting patches, etc.
- Provides consistency by tracking read/write and write/write conflicts.
- Provides atomicity, but not isolation.

## Status

This is alpha software.
It's a simple library with fairly good test coverage.
If you find it useful, please let me know.

### TODO

- [ ] Benchmarking
- [ ] API for extending transaction buffers for custom types

## Example

```typescript
import { inTransaction, wrapRoot } from "stm";

const myData = wrapRoot({
  name: "Me",
  address: "Mystreet 42",
  attributes: {
    atHome: false,
  },
});

function relocate(data: typeof myData) {
  // inTransaction creates a transaction and commits unless the function
  // throws an exception.
  inTransaction(() => {
    data.address = "Newstreet 44";
    data.attributes.atHome = true;

    // While inside inTransaction, anything that reads the data will see
    // the updates. If something outside the transaction modifies the data
    // before commit, commit will fail. First to commit wins in write/write
    // conflicts.

    validateData(data);

    // Returning gracefully means the data will be committed.
  });
}

function validateData(data: typeof myData) {
  if (!data.address) {
    throw new Error("You need to provide an address");
  }

  if (!data.attributes.atHome) {
    throw new Error("You should be at home");
  }
}

relocate(myData);
```

## How It Works

Objects are wrapped in `Proxy` so we can intercept both reads and writes.
If there is no current transaction, calls go straight through to the original (target) object.
There are proxies specific to objects like Array, Map and Set.

Transactions contain a list of object copies, called `Buffers`.
Transactions do copy-on-write of whole objects, storing them locally.
When committing, a two-phase commit first ensures there are no conflicts, then copies the local data into the target.

If there is a nested transaction, instead of copying to the target, data is copied to the outer transaction on commit.
This is called "merge" internally, because it merges `Buffers`.

Buffers are dedicated to one type of object.
Plain objects (`ObjectBuffer`) is the default, but arrays, Maps and Sets have custom buffers.
This allows differentiating read from write based on which method is being invoked.
The API for subclassing buffers is currently private, but this shouldn't stop classes and prototype chains from working in the simple case.
If you are using STM-ts on top of another proxy where a "read" operation (get/has/ownKeys) actually modifies the data, the assumptions this library makes do not hold.

Hooks, inspired by [Preact](https://preactjs.com/), are called at various points in the process, to allow extending the functionality.
The most interesting hook is probably the `commit` hook, which receives a list of changes that will be applied.
