/**
 * `@rexezuge/runtime` — the platform foundation layer: DI, configuration,
 * worker bases, logger, KV cache. Zero dependencies (the one platform import
 * is type-only, resolved through each consumer's generated wrangler types).
 */

export { Container } from './di/Container.ts';
export type { Factory, Token } from './di/Container.ts';
export { asScopedContext, getRequestScope, tryGetRequestScope, setRequestScope, SCOPE_MISSING_MESSAGE } from './di/RequestScope.ts';
export type { ScopedContext } from './di/RequestScope.ts';
export { AppConfiguration } from './config/AppConfiguration.ts';
export { EnvParser } from './config/EnvParser.ts';
export { DEFAULT_SITE_URL } from './config/ConfigurationDefaults.ts';
export { AbstractEntrypointWorker } from './base/AbstractEntrypointWorker.ts';
export type { WorkerExecutionContext, WorkerScheduledController } from './base/AbstractEntrypointWorker.ts';
export { AbstractDurableObjectWorker } from './base/AbstractDurableObjectWorker.ts';
export { AbstractQueueWorker } from './base/AbstractQueueWorker.ts';
export { AbstractWorkflowWorker } from './base/AbstractWorkflowWorker.ts';
export { BASE_WORKER_MESSAGES } from './base/baseWorkerError.ts';
export type { BaseWorkerOperation } from './base/baseWorkerError.ts';
export { consoleSink, createLogger, isLogLevel, resetLogLevelForTests, resolveLogLevel, setLogLevel } from './logger.ts';
export type { LogLevel, Logger, LogSink } from './logger.ts';
export {
  COOLDOWN_MS,
  FAILURE_THRESHOLD,
  KV_DOMAINS,
  KV_KEY_VERSION,
  KV_MAX_KEY_LENGTH,
  KV_MIN_TTL_SECONDS,
  KvCache,
  PURGE_LIST_LIMIT,
  PURGE_MAX_PAGES,
  UNMETERED,
  buildKvKey,
  clampTtl,
  digest128,
  resetBreakerForTests,
  sanitizeSegment,
  utf8ByteLength,
} from './kv/index.ts';
export type { KvDomainDef, KvDomainName, KvDomains, KvNamespaceLike, KvPutOptions, SubrequestMeterLike } from './kv/index.ts';
export { AbstractScheduledTask, TaskRegistry } from './scheduled/index.ts';
export type { ApplicationRunHandle, ScheduledTaskEnv, TaskLogger, TaskRunRecorder, TaskRunSummary } from './scheduled/index.ts';
