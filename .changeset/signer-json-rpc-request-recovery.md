---
"@ckb-ccc/core": minor
---

Add owned provider sessions and request result recovery to signer JSON-RPC.
Requests now carry metadata with unique request and session IDs, providers
require a successful connection before signer operations, and clients retry
transport failures with the same request ID and a ten-second per-attempt
timeout before recovering results through `get_result`. Result lookup no
longer requires a session ID, and a missing result rethrows the original
request error. Replacing a signer aborts retries and result recovery owned by
the old signer lifecycle.
