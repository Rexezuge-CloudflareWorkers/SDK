/**
 * `@rexezuge/runtime` — the platform foundation layer: DI, configuration,
 * worker bases, logger, KV cache. Zero dependencies (the one platform import
 * is type-only, resolved through each consumer's generated wrangler types).
 */

export { Container } from './di/Container';
export type { Factory, Token } from './di/Container';
export { asScopedContext, getRequestScope, setRequestScope } from './di/RequestScope';
export type { ScopedContext } from './di/RequestScope';
export { AppConfiguration } from './config/AppConfiguration';
export { EnvParser } from './config/EnvParser';
export { DEFAULT_SITE_URL } from './config/ConfigurationDefaults';
export { AbstractEntrypointWorker } from './base/AbstractEntrypointWorker';
export type { WorkerExecutionContext, WorkerScheduledController } from './base/AbstractEntrypointWorker';
export { AbstractDurableObjectWorker } from './base/AbstractDurableObjectWorker';
export { AbstractQueueWorker } from './base/AbstractQueueWorker';
export type { WorkerMessageBatch } from './base/AbstractQueueWorker';
export { AbstractWorkflowWorker } from './base/AbstractWorkflowWorker';
export type { WorkflowEventLike, WorkflowStepLike } from './base/AbstractWorkflowWorker';
export { createLogger, isLogLevel, resolveLogLevel } from './logger';
export type { LogLevel, Logger } from './logger';
export { KvCache, KV_DOMAINS, buildKvKey, clampTtl, digest128 } from './kv';
export type { KvDomainDef, KvDomainName, KvNamespaceLike } from './kv';
export { AbstractScheduledTask, TaskRegistry } from './scheduled';
export type { ApplicationRunHandle, ScheduledTaskEnv, TaskLogger, TaskRunRecorder, TaskRunSummary } from './scheduled';
