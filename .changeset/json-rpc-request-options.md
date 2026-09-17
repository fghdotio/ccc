---
"@ckb-ccc/core": minor
"@ckb-ccc/libp2p": minor
---

Add per-request cancellation and timeout options to JSON-RPC transports.
WebSocket and libp2p transports now cancel individual operations without
interrupting unrelated requests, and JSON-RPC errors are exposed as
`JsonRpcError` instances.
