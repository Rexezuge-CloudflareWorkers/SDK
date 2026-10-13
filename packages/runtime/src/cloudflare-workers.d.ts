/**
 * Minimal `cloudflare:workers` surface for the kit's own typecheck.
 *
 * Provenance: the consumer repos resolve the real module through the
 * `worker-configuration.d.ts` wrangler generates into each repo (their package
 * tsconfigs `include` it). This kit has no such file, and
 * `AbstractDurableObjectWorker` needs the platform base class to exist here.
 *
 * This file is a **typecheck-time input only**: TypeScript never emits a `.d.ts`
 * input to `dist/`, and `files: ["dist"]` means it is not published. A consumer
 * resolves `cloudflare:workers` against its own generated ambient types, which
 * are the same platform module — the kit's declaration is the narrow subset its
 * own source touches (ctx, env, and the Fetch API types that ship with lib.dom).
 */
declare module 'cloudflare:workers' {
  /**
   * The Durable Object base class, narrowed to the members the family's DO
   * bases actually use. Extended only by `AbstractDurableObjectWorker`.
   */
  export class DurableObject<TEnv = unknown> {
    protected ctx: DurableObjectState;
    protected env: TEnv;
    constructor(ctx: DurableObjectState, env: TEnv);
  }

  /**
  The per-DO state object, narrowed to what the kit reads.
  */
  export interface DurableObjectState {
    readonly id: { toString(): string; readonly name?: string };
    waitUntil(promise: Promise<unknown>): void;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  }

  /**
   * The Workflow base, narrowed to the members `AbstractWorkflowWorker` needs.

   * Declared because the base **extends** it: a workflow handler reaches for
   * `this.env` to build its request scope, so a base that dropped the
   * `WorkflowEntrypoint` parent would silently take that capability away from
   * every consumer with a real workflow. `env` is therefore part of this
   * declaration's reason to exist, not an incidental member.
   */
  export abstract class WorkflowEntrypoint<TEnv = unknown, TPayload = unknown> {
    protected ctx: ExecutionContext;
    protected env: TEnv;
    constructor(ctx: ExecutionContext, env: TEnv);
    run(event: Readonly<WorkflowEvent<TPayload>>, step: WorkflowStep): Promise<unknown>;
  }

  export type WorkflowDurationLabel = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  export type WorkflowSleepDuration = `${number} ${WorkflowDurationLabel}${'s' | ''}` | number;
  export type WorkflowBackoff = 'constant' | 'linear' | 'exponential';

  export type WorkflowStepConfig = {
    retries?: {
      limit: number;
      delay: WorkflowSleepDuration | number;
      backoff?: WorkflowBackoff;
    };
    timeout?: WorkflowSleepDuration | number;
  };

  export type WorkflowStepContext = {
    step: { name: string; count: number };
    attempt: number;
  };

  export type WorkflowEvent<T> = {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
  };

  /**
   * The step handle, narrowed to `do`/`sleep`/`sleepUntil`.

   * `do` keeps its three-argument form (`name`, config, callback). The
   * two-argument form was the shape the kit converged on, and it is the one a
   * real workflow cannot use: `retries` and `timeout` are what make a step a
   * *step* rather than a plain coroutine call, so a base that only modelled
   * `(name, callback)` took the retry semantics away from every consumer.
   */
  export abstract class WorkflowStep {
    do<T>(name: string, callback: (ctx: WorkflowStepContext) => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: (ctx: WorkflowStepContext) => Promise<T>): Promise<T>;
    sleep(name: string, duration: WorkflowSleepDuration): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }
}

/**
 * The structural constraint the platform puts on RPC-transmissible values.
 *
 * Declared so the workflow base can express `TPayload extends Rpc.Serializable<TPayload>`
 * the way the platform entrypoint does. Consumers resolve the real `Rpc`
 * namespace from their own generated types.
 */
declare namespace Rpc {
  type Serializable<T> = T;
}

/**
 * The platform globals the worker bases reference.
 *
 * Both are intentionally minimal structural types: consumers compile against
 * wrangler's generated `worker-configuration.d.ts`, which declares the real
 * (per-app) `Env` and the platform `ExecutionContext`; interface declaration
 * merging means the two coexist. The kit's own build and tests only need the
 * names to exist, because nothing here reads a specific binding.
 */
interface Env {
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
