---
'@rexezuge/web': patch
---

`createApiClient` forwards a caller's `cache` mode to `fetch`, and the UI peers
(`react`, `react-dom`, `lucide-react`) are optional so importing the
framework-free API client does not require a UI toolchain.
