---
'@rexezuge/tooling': patch
---

`spaShellEmbedPlugin` resolves a relative `distIndex` against the root, and
`ProxyEntry` can say it proxies a WebSocket.

**The relative `distIndex`.** It resolved against the process's working
directory rather than the `root` the plugin was given, and under
`pnpm --filter … build` the working directory is the _package_ directory
rather than the repository root — so a consumer naming the built file
relative to the root it had just been given wrote nowhere. The plugin then
reported "dist/index.html not found, skipping", which is also what a
genuinely fresh checkout prints on its first build, so the two are
indistinguishable in the log and the worker keeps serving the _previous_
shell: the SPA ships yesterday's JavaScript with nothing in the build log
to explain it. A relative path now resolves against the root, exactly as
`path` already did.

**The WebSocket proxy.** `ProxyEntry` had no way to say that a path carries a
WebSocket. Vite's `server.proxy` needs `ws: true` for such an entry, and
without it the handshake is proxied as an ordinary request and the socket
never opens — so a consumer with a live-update or realtime endpoint could not
express its dev proxy through this table at all.
