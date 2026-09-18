---
"@ckb-ccc/libp2p": minor
"@ckb-ccc/connector": patch
---

Add a relay connection controller that selects an available relay and keeps it
connected with availability-aware retries. Khie now restores relay and paired
peer connectivity after network changes.
