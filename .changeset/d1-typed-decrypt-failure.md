---
'@rexezuge/d1': patch
---

`decryptSecret` now throws `AesGcmKeyError` — the error its own contract documents — on a wrong key or tampered ciphertext. A bare `rejects.toThrow()` in the suite let the platform's raw `OperationError: The operation failed for an operation-specific reason` escape as the behavior, so a consumer catching the documented type missed it and the one place it surfaced was a run's error message with nothing an owner could act on.
