import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { BASE_WORKER_MESSAGES } from './baseWorkerError.ts';

/**
 * The Workflow base, converged from the `AbstractWorkflowWorker` copies in
 * Edge-Git and Mail-Otter (Edge-Sonic ships the same shape as `runWorkflow.ts`
 * with a `WorkflowEntrypoint` wrapper around it).
 *
 * It extends the platform `WorkflowEntrypoint` because a workflow handler needs
 * `this.env` — it is where the bindings come from, and every step in a real
 * workflow builds a request scope from it. An earlier version of this file
 * modelled `WorkflowEventLike`/`WorkflowStepLike` as standalone structural
 * types and dropped the parent class, which removed `this.env` and reduced
 * `step.do` to `(name, callback)`. That is not a stricter shape, it is a lossy
 * one: it took away the per-step `retries`/`timeout` config that makes a step
 * retryable under the platform rather than a bare coroutine call. Both are
 * restored here, and the structural types are gone with them — the platform
 * types are the ones that were correct all along.
 */
abstract class AbstractWorkflowWorker<TEnv = Env, TPayload = unknown, TResult = unknown> extends WorkflowEntrypoint<TEnv, TPayload> {
  public async run(event: Readonly<WorkflowEvent<TPayload>>, step: WorkflowStep): Promise<TResult> {
    try {
      return await this.onWorkflow(event, step);
    } catch (err: unknown) {
      this.reportUnhandled(BASE_WORKER_MESSAGES.workflow, err);
      throw err;
    }
  }

  /**
   * The sink for an unhandled rejection at this base's boundary. See
   * `AbstractEntrypointWorker.reportUnhandled`.
   */
  protected reportUnhandled(message: string, error: unknown): void {
    console.error(message, error);
  }

  protected abstract onWorkflow(event: Readonly<WorkflowEvent<TPayload>>, step: WorkflowStep): Promise<TResult>;
}

export { AbstractWorkflowWorker };
