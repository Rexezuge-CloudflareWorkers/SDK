---
'@rexezuge/sdk-codemods': patch
---

Fix two codemod rewrites that produced imports the kit does not ship.

- `CONFIG_RENAMES` mapped `Provider` and `ServiceContext` to `RequestScope`.
  `@rexezuge/runtime` exports no such symbol — `di/RequestScope.ts` is a
  module, whose exports are the `setRequestScope` / `getRequestScope` /
  `asScopedContext` functions — and neither source name has a kit counterpart:
  `Provider<T>` is a lazy memoized DAO thunk and `ServiceContext` is the
  consumer's `{ env, logger, clock }` value object. Both rows are removed, so
  they now stay local instead of becoming broken imports.
- `rename-imports` carried a one-to-one tail that rewrote any `shared/utils/X`
  onto `@rexezuge/shared/X` on the theory that the kit preserves the source
  tree. It preserves only the files it converged: Edge-Git ships
  `BranchValidation`, `ConcurrencyUtil`, `GitOids`, `SlugValidation` and
  `SsrfHosts` there and the kit has none of them, so live imports were
  rewritten onto modules that do not exist. The tail is gone; an unmapped file
  is now reported rather than rewritten.
