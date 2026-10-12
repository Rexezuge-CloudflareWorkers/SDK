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
