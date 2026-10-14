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

/**
 * Where a formatted emit goes.
 *
 * A **port, not a policy**: the kit owns the level decision, the namespace
 * prefix and the argument list, and the consumer owns what happens to the bytes.
 * The gap this fills is redaction. A consumer whose surfaces handle AWS
 * `SecretAccessKey`s, session tokens and HMAC secrets cannot let an arbitrary
 * object reach `console.*` — and the defence that actually holds is applied at
 * the sink, because a check at each call site is a hundred chances to forget
 * one. Without a seam, that consumer has to reimplement the logger itself
 * (level resolution included) or ship its secrets to the log tail.
 *
 * A deny-list is consumer policy and deliberately not here: the key names that
 * mean "secret" are a property of the consumer's data model, and the kit
 * redaction-guessing across nine repos' vocabularies would redact diagnostic
 * fields and train everyone to ignore the markers.
 *
 * The sink receives the level **and the namespace prefix already applied**, so a
 * consumer that forwards to an aggregator does not have to reconstruct either.
 */
interface LogSink {
  (level: LogLevel, message: string, args: readonly unknown[]): void;
}

/**
 * The default sink: today's behaviour, verbatim.
 *
 * Named rather than inlined so {@link createLogger}'s signature stays a plain
 * optional argument and a consumer can wrap it — `createLogger(ns, repo, env,
 * redactingSink(consoleSink))` — without reimplementing the level check.
 */
function consoleSink(level: LogLevel, message: string, args: readonly unknown[]): void {
  const line = `[${level.toUpperCase()}] ${message}`;
  switch (level) {
    case 'debug': {
      console.debug(line, ...args);
      break;
    }
    case 'error': {
      console.error(line, ...args);
      break;
    }
    case 'warn': {
      console.warn(line, ...args);
      break;
    }
    default: {
      console.info(line, ...args);
    }
  }
}

/**
 * @param sink Where each accepted emit goes. Defaults to {@link consoleSink}.
 */
function createLogger(namespace?: string, fullRepoName?: string, env?: unknown, sink: LogSink = consoleSink): Logger {
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
      if (enabled('debug')) sink('debug', argsStr, args);
    },
    info: (...args: unknown[]): void => {
      if (enabled('info')) sink('info', argsStr, args);
    },
    warn: (...args: unknown[]): void => {
      if (enabled('warn')) sink('warn', argsStr, args);
    },
    error: (...args: unknown[]): void => {
      if (enabled('error')) sink('error', argsStr, args);
    },
  };
}

export { consoleSink, createLogger, isLogLevel, resetLogLevelForTests, resolveLogLevel, setLogLevel };
export type { LogLevel, Logger, LogSink };
