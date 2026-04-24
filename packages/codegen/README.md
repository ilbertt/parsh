# @parsh/codegen

Filesystem-driven command tree generator for [`@parsh/core`](../core).

Walks a `commands/` directory, emits a `commandTree.gen.ts` file with a `CommandRegistry` augmentation (precomputed inheritance intersections) and a runtime command tree the `createCLI` runner walks at dispatch time.

Internal workspace package `@repo/codegen` builds into `pkg/`, which is published to npm as `@parsh/codegen`.

## Binary

```sh
parsh generate                 # one-shot
parsh generate --watch         # regenerate on add/remove/rename
```
