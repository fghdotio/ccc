---
"@ckb-ccc/core": minor
---

Add owned provider sessions and request result recovery to signer JSON-RPC.
Requests now carry metadata with unique request and session IDs, providers
require a successful connection before signer operations, and clients recover
lost responses through `get_result` without repeating those operations.
