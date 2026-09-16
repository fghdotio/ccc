---
"@ckb-ccc/core": patch
"@ckb-ccc/joy-id": patch
"@ckb-ccc/uni-sat": patch
"@ckb-ccc/okx": patch
"@ckb-ccc/xverse": patch
---

Apply the documented `signPsbt` defaults consistently across BTC wallets.

- UniSat and OKX now translate `SignPsbtOptions` into the wallet's own
  `{ autoFinalized, toSignInputs }` shape instead of forwarding the CCC
  options as-is, so `autoFinalized` defaults to `true` and `inputsToSign` is
  no longer silently ignored. `UniSatA.Provider.signPsbt` is now typed with
  the wallet's actual option shape, exposed as `UniSatA.SignPsbtOptions`.
- JoyID now sends `inputsToSign` as the `toSignInputs` field it expects,
  instead of silently dropping it.
- Xverse now finalizes the requested inputs locally when `autoFinalized` is
  enabled, since its `signPsbt` RPC returns unfinalized PSBTs and has no
  finalize option.
