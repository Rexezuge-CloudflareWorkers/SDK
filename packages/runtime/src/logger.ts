/**
 * `KvLogger` — the family's console logger with a level floor.
 *
 * Converged from `backend-runtime/src/logger.ts`, which is identical in
 * Durable-DAV, Durable-DAV-Router, Edge-Sonic, Mail-Otter and Mail-Meow (the
 * copies in AWS/ChordDHT's `shared` are the same shape without the env floor).
 *
 * The level resolves from an injected `env` first, then `process.env`, then
 * anything {@link setLogLevel} installed, then `info`: Workers have no
 * `process.env` at runtime, so an injected object is the configuration path,
 * and `process.env` is a local-tooling affordance. An unrecognized level floors
 * at `info` rather than throwing — a typo in `LOG_LEVEL` costing a worker a
 * cold start is not a trade worth making.
 *
 * ### The level is read per emit, not per construction
 *
 * Both loggers a repo holds at module scope — one in this file's `KvCache`, one
 * in its KV facade — are constructed when the isolate starts, long before any
 * request scope exists to hand them an `env`. Resolving the level in the
 * constructor therefore meant a module-scope logger could *only ever* read
 * `process.env`, which workerd does not have: `LOG_LEVEL=debug` shipped,
 * validated by nothing, and was inert. `setLogLevel` is the seam that closes
 * that, and every emit re-reads so an already-constructed logger picks the level
 * up without being rebuilt.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

function isLogLevel(level: string): level is LogLevel {
  return (['debug', 'info', 'warn', 'error'] as const).includes(level as LogLevel);
}

/**
 * What {@link setLogLevel} installed, or `undefined` when nothing has.
 *
 * Module-level rather than per-logger because the emit path must not depend on
 * which logger asks: a logger built before the scope existed and a logger built
 * after it have to answer the same question identically.
 */
let installedLogLevel: LogLevel | undefined;

function resolveLogLevel(env?: unknown): LogLevel {
  const fromInjected = env !== null && typeof env === 'object' ? (env as Record<string, string | undefined>)['LOG_LEVEL'] : undefined;
  const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LOG_LEVEL;
  const level = fromInjected ?? fromEnv ?? installedLogLevel ?? 'info';
  return isLogLevel(level) ? level : 'info';
}

/**
 * Install the level every logger falls back to, for the rest of the isolate.
 *
 * The third source in {@link resolveLogLevel}'s chain, and below both an
 * injected `env` and `process.env` on purpose: an explicit request scope
 * outranks a process-wide default, and a developer's local shell outranks both.
 * Only what neither can answer falls through to this.
 *
 * A composition root calls it once, with the level its config resolved to.
 * Unrecognized input clears the installation rather than throwing — the same
 * "a typo costs a cold start" trade as everywhere else in this file.
 */
function setLogLevel(level: string | undefined): void {
  installedLogLevel = typeof level === 'string' && isLogLevel(level) ? level : undefined;
}

/**
 * Test seam: forget whatever {@link setLogLevel} installed.
 */
function resetLogLevelForTests(): void {
  installedLogLevel = undefined;
}

interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function createLogger(namespace?: string, fullRepoName?: string, env?: unknown): Logger {
  const argsStr = [fullRepoName, namespace]
    .filter(Boolean)
    .map((s) => `[${s}]`)
    .join(' ');

  // `enabled` is called per emit rather than compared against a level captured
  // at construction, for the reason in the header: these loggers are built at
  // module scope and the level that answers is not known until a scope runs.
  const enabled = (level: LogLevel): boolean => LOG_LEVELS[level] >= LOG_LEVELS[resolveLogLevel(env)];

  return {
    debug: (...args: unknown[]): void => {
      if (enabled('debug')) {
        console.debug(`[DEBUG] ${argsStr}`, ...args);
      }
    },
    info: (...args: unknown[]): void => {
      if (enabled('info')) {
        console.info(`[INFO] ${argsStr}`, ...args);
      }
    },
    warn: (...args: unknown[]): void => {
      if (enabled('warn')) {
        console.warn(`[WARN] ${argsStr}`, ...args);
      }
    },
    error: (...args: unknown[]): void => {
      if (enabled('error')) {
        console.error(`[ERROR] ${argsStr}`, ...args);
      }
    },
  };
}

export { createLogger, isLogLevel, resetLogLevelForTests, resolveLogLevel, setLogLevel };
export type { LogLevel, Logger };
