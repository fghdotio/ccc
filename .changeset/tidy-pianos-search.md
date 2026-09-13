---
"@ckb-ccc/core": patch
---

Document that a configured cell dep outpoint is discarded when the dep carries a type id.

Several outpoints in the known-script tables no longer resolve, which reads as a bug until
you know that `getCellDeps` looks the live cell up by type id before use. This adds that to
the tables themselves, where somebody checking the outpoints will be looking, and makes the
method's own docstring say plainly that the configured outpoint is not the one that reaches
the transaction.
