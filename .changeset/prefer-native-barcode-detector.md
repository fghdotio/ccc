---
"@ckb-ccc/connector": patch
---

Prefer the browser's native `BarcodeDetector` for QR scanning when available,
while retaining the existing decoder as a fallback.
