---
"@ckb-ccc/core": minor
---

Add request result recovery to signer JSON-RPC. Requests now carry unique IDs,
providers retain pending and completed results temporarily, and clients recover
lost responses through `get_result` without repeating signer operations.
