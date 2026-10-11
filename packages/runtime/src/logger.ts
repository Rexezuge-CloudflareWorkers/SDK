/**
 * `KvLogger` — the family's console logger with a level floor.
 *
 * Converged from `backend-runtime/src/logger.ts`, which is identical in
 * Durable-DAV, Durable-DAV-Router, Edge-Sonic, Mail-Otter and Mail-Meow (the
 * copies in AWS/ChordDHT's `shared` are the same shape without the env floor).
 *
 * The level resolves from an injected `env` first, then `process.env`, then
 * `info`: Workers have no `process.env` at runtime, so an injected object is
 * the configuration path, and `process.env` is a local-tooling affordance. An
 * unrecognized level floors at `info` rather than throwing — a typo in
 * `LOG_LEVEL` costing a worker a cold start is not a trade worth making.
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

function resolveLogLevel(env?: unknown): LogLevel {
  const fromInjected = env !== null && typeof env === 'object' ? (env as Record<string, string | undefined>)['LOG_LEVEL'] : undefined;
  const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LOG_LEVEL;
  const level = fromInjected ?? fromEnv ?? 'info';
  return isLogLevel(level) ? level : 'info';
}

interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function createLogger(namespace?: string, fullRepoName?: string, env?: unknown): Logger {
  const currentLevel = resolveLogLevel(env);
  const minLevel = LOG_LEVELS[currentLevel];

  const argsStr = [fullRepoName, namespace]
    .filter(Boolean)
    .map((s) => `[${s}]`)
    .join(' ');

  return {
    debug: (...args: unknown[]): void => {
      if (LOG_LEVELS.debug >= minLevel) {
        console.debug(`[DEBUG] ${argsStr}`, ...args);
      }
    },
    info: (...args: unknown[]): void => {
      if (LOG_LEVELS.info >= minLevel) {
        console.info(`[INFO] ${argsStr}`, ...args);
      }
    },
    warn: (...args: unknown[]): void => {
      if (LOG_LEVELS.warn >= minLevel) {
        console.warn(`[WARN] ${argsStr}`, ...args);
      }
    },
    error: (...args: unknown[]): void => {
      if (LOG_LEVELS.error >= minLevel) {
        console.error(`[ERROR] ${argsStr}`, ...args);
      }
    },
  };
}

export { createLogger, isLogLevel, resolveLogLevel };
export type { LogLevel, Logger };
