/**
 * The Workflow base, converged verbatim from `AbstractWorkflowWorker.ts`
 * (identical in Edge-Git and Mail-Otter; Edge-Sonic ships the same shape as
 * `runWorkflow.ts` with a `WorkflowEntrypoint` wrapper around it).
 *
 * `WorkflowStepLike` is the minimal `step.do` surface: a workflow whose steps
 * are not retried by the platform is just a coroutine, and the wrapper exists
 * to keep the retry semantics visible in one place.
 */
interface WorkflowEventLike<T = unknown> {
  payload: T;
}

interface WorkflowStepLike {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

abstract class AbstractWorkflowWorker<TPayload = unknown, TResult = unknown> {
  public async run(event: Readonly<WorkflowEventLike<TPayload>>, step: WorkflowStepLike): Promise<TResult> {
    try {
      return await this.onWorkflow(event, step);
    } catch (err: unknown) {
      console.error('Unhandled error in workflow run():', err);
      throw err;
    }
  }

  protected abstract onWorkflow(event: Readonly<WorkflowEventLike<TPayload>>, step: WorkflowStepLike): Promise<TResult>;
}

export { AbstractWorkflowWorker };
export type { WorkflowEventLike, WorkflowStepLike };
