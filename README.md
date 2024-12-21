# Software Transactional Memory for TypeScript

This library provides an STM primitive for TypeScript, simplifying the case where you need to make many small changes to TypeScript data and either commit or roll back.

## Features

- Simple interface that uses [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy) objects to transparently wrap objects.
- Support for objects, nested objects, cyclic data structures.
- Support for nested transactions.
- Hooks for extending the functionality.
- Provides a list of changes for creating logs, transmitting patches, etc.
- Provides consistency by tracking read/write and write/write conflicts.
- Provides atomicity, but not isolation.

## Status

This is alpha software.
It's a simple library with fairly good test coverage.
If you find it useful, please let me know.

### TODO

- [ ] Array
- [ ] Map
- [ ] Set

## Example

```typescript
import { newRoot, inTransaction } from "stm";

const myData = myRoot({
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
