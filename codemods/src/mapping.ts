/**
 * The mapping every codemod reads: what a consumer's in-repo package becomes
 * in the kit, and the symbol renames the kit's canonical names require.
 *
 * The kit follows the best design; consumers adapt. These tables are that
 * adaptation, written once. A rename not listed here is deliberate: the kit
 * kept the source spelling (e.g. `CryptoUtil`, `TimestampUtil`, `useNotice`),
 * so only the specifier changes.
 */

/** In-repo package (by basename) → kit package name. */
const PACKAGE_MAP: Readonly<Record<string, string>> = {
  'backend-errors': '@rexezuge/errors',
  'backend-runtime': '@rexezuge/runtime',
  shared: '@rexezuge/shared',
  'backend-data': '@rexezuge/d1',
  identity: '@rexezuge/identity',
  web: '@rexezuge/web',
  tooling: '@rexezuge/tooling',
};

/**
 * Subpath renames inside kit packages. Key: the old import path *after* the
 * package specifier; value: the new one.
 */
const SUBPATH_MAP: Readonly<Record<string, Record<string, string>>> = {
  '@rexezuge/d1': {
    '/utils': '', // utils barrel → package root
    '/utils/D1Utils': '',
    '/utils/D1ErrorClassifier': '',
    '/utils/D1Types': '',
    '/dao/BaseDAO': '',
    '/dao': '',
    '/dao/UserDAO': '@rexezuge/identity', // identity owns the user DAOs
    '/dao/UserEmailDAO': '@rexezuge/identity',
    '/crypto/aes-gcm': '',
    '/crypto': '',
  },
  '@rexezuge/shared': {
    '/utils': '',
    '/utils/UUIDUtil': '',
    '/utils/TimestampUtil': '',
    '/i18n': '@rexezuge/i18n', // the i18n bundle is its own package
  },
};

/** DAO retry-surface renames (method call sites and the helper names). */
const DAO_RENAMES: Readonly<Record<string, string>> = {
  withRetry: 'run',
  allWithRetry: 'all',
  firstWithRetry: 'first',
  runWithRetry: 'run',
  runWriteStatement: 'run',
  runWriteBatch: 'batch',
  findById: 'first',
};

/** Config/DI renames across the family's copies. */
const CONFIG_RENAMES: Readonly<Record<string, string>> = {
  AppConfig: 'AppConfiguration',
  ConfigurationManager: 'AppConfiguration',
  Provider: 'RequestScope',
  ServiceContext: 'RequestScope',
};

/** Identity service renames across the family's copies. */
const IDENTITY_RENAMES: Readonly<Record<string, string>> = {
  resolveUserById: 'resolveAccountById',
  resolveUserId: 'resolveAccountId',
};

export { CONFIG_RENAMES, DAO_RENAMES, IDENTITY_RENAMES, PACKAGE_MAP, SUBPATH_MAP };
