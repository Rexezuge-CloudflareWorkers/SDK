/**
 * The mapping every codemod reads: what a consumer's in-repo package becomes
 * in the kit, and the symbol renames the kit's canonical names require.
 *
 * The kit follows the best design; consumers adapt. These tables are that
 * adaptation, written once.
 *
 * **Whole-package migration.** `backend-errors` is deleted outright: everything
 * in it is in `@rexezuge/errors`, so every `@scope/backend-errors` import — and
 * only that specifier — moves.
 */
export const WHOLE_PACKAGE_MAP: Readonly<Record<string, string>> = {
  'backend-errors': '@rexezuge/errors',
};

/**
 * The per-package subpath table shape.
 *
 * - a value is a kit specifier, `''` means the kit package root, `null` means
 *   the import stays exactly as it is;
 * - no entry matching means *stays local* — the safe default. An unmapped
 *   specifier inside a mapped package is reported (see `renameImports`), so the
 *   operator sees it instead of a silent half-migration.
 */
export type SubpathRules = Readonly<Record<string, Record<string, string | null | undefined> & { default?: string | null }>>;

/**
 * Per-source-package subpath rules for the packages that *stay* in the consumer
 * (the repo's own business layer keeps existing; only the framework kernel
 * moves out).
 */
export const SUBPATH_RULES: SubpathRules = {
  // shared keeps constants/model/schema; utils, the i18n bundle and the URL
  // policy subtree move.
  shared: {
    '/utils': '',
    '/utils/UUIDUtil': '',
    '/utils/TimestampUtil': '',
    '/i18n': '@rexezuge/i18n',
    // Durable-DAV's `shared/net` barrel is the kit's RemoteUrlPolicy (the kit
    // converged it, so `net` is a kernel subtree, not a business one).
    '/net': '',
    '/constants': null,
    '/model': null,
    '/schema': null,
  },

  // backend-runtime keeps ConfigurationManager, config sections, http helpers
  // and DO constants; the base workers, EnvParser, DI, logger and KV move.
  'backend-runtime': {
    '/base/AbstractEntrypointWorker': '@rexezuge/runtime',
    '/base/AbstractDurableObjectWorker': '@rexezuge/runtime',
    '/base/AbstractQueueWorker': '@rexezuge/runtime',
    '/base/AbstractWorkflowWorker': '@rexezuge/runtime',
    '/base': '@rexezuge/runtime',
    '/di': '@rexezuge/runtime',
    '/di/Container': '',
    '/di/RequestScope': '',
    '/logger': '@rexezuge/runtime',
    '/kv': '@rexezuge/runtime',
    '/config/EnvParser': '@rexezuge/runtime',
    '/config/ConfigurationDefaults': '@rexezuge/runtime',
    '/config/AppConfiguration': '@rexezuge/runtime',
    default: null, // ConfigurationManager, http/, constants/ stay local
  },

  // backend-data stays as the repo's business D1 layer; its kernel — the retry
  // engine, the classifier, BaseDAO, the cipher and the user-table DAOs — moves.
  'backend-data': {
    '/utils': '@rexezuge/d1',
    '/utils/D1Utils': '@rexezuge/d1',
    '/utils/D1ErrorClassifier': '@rexezuge/d1',
    '/utils/D1Types': '@rexezuge/d1',
    '/dao/BaseDAO': '@rexezuge/d1',
    '/dao': null, // the barrel stays: business DAOs live here
    '/crypto/aes-gcm': '@rexezuge/d1',
    '/crypto': null, // business crypto (sealed credentials) stays
    default: null, // UserDAO/UserEmailDAO stay until this repo adopts identity
  },
};

/**
The kit package each *subpath-rule* source package's kernel moves into.
*/
export const KIT_PACKAGE_FOR: Readonly<Record<string, string>> = {
  shared: '@rexezuge/shared',
  'backend-runtime': '@rexezuge/runtime',
  'backend-data': '@rexezuge/d1',
};

/**
 * Identity DAOs living inside `backend-data`, which stays a local package.
 *
 * They move to `@rexezuge/identity` rather than `@rexezuge/d1` because the
 * convergence that produced them was the *identity* one — the frozen anchor and
 * the verified-address registry — and shipping them from `d1` would freeze the
 * pre-identity shape as the canonical one.
 *
 * Applied *after* `SUBPATH_RULES`, so a repo can override them by declaring its
 * own row: that is the escape hatch for a repo whose `users` table has columns
 * the kit's DAO does not model.
 */
export const IDENTITY_DAO_SUBPATHS: Readonly<Record<string, string>> = {
  '/dao/UserDAO': '@rexezuge/identity',
  '/dao/UserEmailDAO': '@rexezuge/identity',
  '/dao/identity': '@rexezuge/identity',
};

/**
 * DD's i18n barrel names → the kit's canonical ones. Shells, not re-exports:
 * a repo keeping `BACKEND_STRINGS` locally would be a second source of truth
 * for the locale table the kit's parity tests pin.
 */
export const I18N_RENAMES: Readonly<Record<string, string>> = {
  BACKEND_STRINGS: 'LOCALE_STRINGS',
  SUPPORTED_BACKEND_LOCALES: 'SUPPORTED_LOCALES',
  getBackendStrings: 'getLocalizedStrings',
  normalizeBackendLocale: 'normalizeLocale',
};

/**
 * DAO retry-surface renames (method call sites and the helper names).
 *
 * `findById` is deliberately absent: it is a BaseDAO *static* in the one repo
 * that had it, and a name business DAOs also use for their own lookups — a
 * rename that cannot be anchored safely by a codemod. Those call sites are
 * renamed by hand during adoption.
 */
export const DAO_RENAMES: Readonly<Record<string, string>> = {
  withRetry: 'run',
  allWithRetry: 'all',
  firstWithRetry: 'first',
  runWithRetry: 'run',
  runWriteStatement: 'run',
  runWriteBatch: 'batch',
};

/**
 * Config/DI renames across the family's copies.
 *
 * `ConfigurationManager` is deliberately absent: it is a *static namespace* the
 * repos that kept it call as `ConfigurationManager.oauth2.*`, not a class the
 * kit replaces — only `AppConfig` (a class rename) moves.
 *
 * `Provider` and `ServiceContext` were once mapped here to `RequestScope`.
 * That was wrong and has been removed: `@rexezuge/runtime` exports **no**
 * symbol named `RequestScope` — `di/RequestScope.ts` is a *module*, whose
 * exports are the `setRequestScope` / `getRequestScope` / `asScopedContext`
 * functions. Renaming to it produced imports of a non-existent export, and
 * neither name has a kit counterpart anyway: `Provider<T>` is a lazy memoized
 * DAO thunk (`() => Promise<T>`, so `scope.get(Tokens.X)()`), and
 * `ServiceContext` is the `{ env, logger, clock }` value object the repo's
 * scope middleware installs. Both stay local in the consumer. A mapping row
 * may only name a symbol the target package actually exports.
 */
export const CONFIG_RENAMES: Readonly<Record<string, string>> = {
  AppConfig: 'AppConfiguration',
};

/**
Identity service renames across the family's copies.

These apply at `this.<name>(` sites **only** — never at an import clause and
never at a bare call. The identity surface has one pair of names that means two
different things depending on where it is used:

- `UserIdentityService.resolveUserId(email)` and `.resolveUserById(userId)` are
  renamed to `resolveAccountId` / `resolveAccountById`;
- `resolveUserId(deps, email)` — the *free function* in `accountLookup` — keeps
  its name, because that is the name `@rexezuge/identity` exports.

A single un-keyed table cannot express that, and picking the wrong reading is
the expensive direction: renaming the free function produced
`import { resolveAccountId } from '@rexezuge/identity'`, and no such symbol
exists, so the failure landed at module resolution rather than at review — the
same class of bug the `CONFIG_RENAMES` note above was written to prevent.

So this table is member-scoped. A repo that deletes its own service in favour of
the kit's is untouched; one that keeps a wrapper method gets the rename it needs.
*/
export const IDENTITY_MEMBER_RENAMES: Readonly<Record<string, string>> = {
  resolveUserById: 'resolveAccountById',
  resolveUserId: 'resolveAccountId',
};

/**
 * A consumer repo's departures from the tables above, loaded from the JSON file
 * passed to `adopt.ts --rules`.
 *
 * This is the escape hatch `IDENTITY_DAO_SUBPATHS` has always described: "a repo
 * can override them by declaring its own row: that is the escape hatch for a repo
 * whose `users` table has columns the kit's DAO does not model." Until now that
 * sentence described a mechanism that did not exist — the tables are module
 * constants, so the only way to override a row was to edit the kit. A repo whose
 * divergence is legitimate and permanent (a product i18n bundle the kit has no
 * keys for, a `users` table carrying a column the kit's DAO does not model) had
 * two bad options and no good one: fork the table by editing the kit, or skip
 * the codemod entirely and hand-migrate.
 *
 * Every field is optional and every row is a merge, not a replacement: a consumer
 * overrides the one specifier that diverges and inherits the rest.
 */
export interface ConsumerRules {
  /**
   * Rows keyed by source package, same shape as `SUBPATH_RULES`.
   *
   * `null` parks a specifier locally even when the kit maps it — the override
   * that a divergent subtree needs. A string rewrites it to somewhere else.
   */
  readonly subpathRules?: Readonly<Record<string, Record<string, string | null | undefined> & { default?: string | null }>>;
  /**
  Identity-DAO rows, same shape and semantics as `subpathRules`.
  */
  readonly identityDaoSubpaths?: Readonly<Record<string, string | null>>;
  /**
   * Which kit package a source package's kernel target resolves to, for the `''`
   * shorthand. Overridable so a repo that re-points one package's kernel at a
   * different kit package overrides the shorthand, not just the explicit rows.
   */
  readonly kitPackageFor?: Readonly<Record<string, string>>;
  /**
  Un-scoped symbol renames, merged over `DAO_RENAMES`/`CONFIG_RENAMES`/`I18N_RENAMES`.
  */
  readonly symbolRenames?: Readonly<Record<string, string>>;
  /**
  Member-scoped renames, merged over `IDENTITY_MEMBER_RENAMES`.
  */
  readonly memberRenames?: Readonly<Record<string, string>>;
}

/**
 * The four tables the transforms actually read, after any consumer overrides.
 *
 * Passed explicitly rather than reached for as module state, so one process can
 * migrate two repos with different rules and a test can state its own without
 * mutating the defaults.
 */
export interface MergedRules {
  readonly subpathRules: SubpathRules;
  readonly identityDaoSubpaths: Readonly<Record<string, string | null>>;
  readonly kitPackageFor: Readonly<Record<string, string>>;
  readonly symbolRenames: Readonly<Record<string, string>>;
  readonly memberRenames: Readonly<Record<string, string>>;
}

/**
The tables as shipped, with nothing overridden.
*/
export const DEFAULT_RULES: MergedRules = {
  subpathRules: SUBPATH_RULES,
  identityDaoSubpaths: IDENTITY_DAO_SUBPATHS,
  kitPackageFor: KIT_PACKAGE_FOR,
  symbolRenames: { ...DAO_RENAMES, ...CONFIG_RENAMES, ...I18N_RENAMES },
  memberRenames: IDENTITY_MEMBER_RENAMES,
};

/**
 * Merge consumer overrides over the shipped tables.
 *
 * Subpath rules merge **per package and per row**, because the override is
 * almost always about one specifier: a repo keeping its own i18n bundle sets
 * `{"shared": {"/i18n": null}}` and must still get the nine other `shared` rows
 * the kit ships. Replacing the whole package instead would silently drop them.
 *
 * Every other table is a flat rename map, so a whole-table merge is exact.
 *
 * A package named in the overrides but absent from the shipped table is allowed:
 * the override is then the only description of it, which is the point of a
 * repo-specific kernel that post-dates the kit.
 */
export function mergeRules(overrides?: ConsumerRules): MergedRules {
  if (overrides === undefined) return DEFAULT_RULES;

  const subpathRules: Record<string, Record<string, string | null | undefined> & { default?: string | null }> = {};
  for (const [packageName, rows] of Object.entries(SUBPATH_RULES)) {
    subpathRules[packageName] = { ...rows };
  }
  for (const [packageName, rows] of Object.entries(overrides.subpathRules ?? {})) {
    subpathRules[packageName] = { ...subpathRules[packageName], ...rows };
  }

  return {
    subpathRules,
    // `null` is meaningful here (park a specifier locally), so these rows merge
    // by key rather than by truthiness.
    identityDaoSubpaths: { ...IDENTITY_DAO_SUBPATHS, ...overrides.identityDaoSubpaths },
    kitPackageFor: { ...KIT_PACKAGE_FOR, ...overrides.kitPackageFor },
    symbolRenames: { ...DEFAULT_RULES.symbolRenames, ...overrides.symbolRenames },
    memberRenames: { ...DEFAULT_RULES.memberRenames, ...overrides.memberRenames },
  };
}
