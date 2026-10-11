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
 * Per-source-package subpath rules for the packages that *stay* in the consumer
 * (the repo's own business layer keeps existing; only the framework kernel
 * moves out):
 *
 * - a value is a kit specifier, `''` means the kit package root, `null` means
 *   the import stays exactly as it is;
 * - no entry matching means *stays local* — the safe default. An unmapped
 *   specifier inside a mapped package is reported (see `renameImports`), so the
 *   operator sees it instead of a silent half-migration.
 */
export const SUBPATH_RULES: Readonly<Record<string, Record<string, string | null | undefined> & { default?: string | null }>> = {
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

/** The kit package each *subpath-rule* source package's kernel moves into. */
export const KIT_PACKAGE_FOR: Readonly<Record<string, string>> = {
  shared: '@rexezuge/shared',
  'backend-runtime': '@rexezuge/runtime',
  'backend-data': '@rexezuge/d1',
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
 */
export const CONFIG_RENAMES: Readonly<Record<string, string>> = {
  AppConfig: 'AppConfiguration',
  Provider: 'RequestScope',
  ServiceContext: 'RequestScope',
};

/** Identity service renames across the family's copies. */
export const IDENTITY_RENAMES: Readonly<Record<string, string>> = {
  resolveUserById: 'resolveAccountById',
  resolveUserId: 'resolveAccountId',
};
