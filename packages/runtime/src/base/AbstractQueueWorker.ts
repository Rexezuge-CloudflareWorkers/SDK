import type { WorkerExecutionContext } from './AbstractEntrypointWorker.ts';

/**
 * The queue consumer base, converged verbatim from `AbstractQueueWorker.ts`
 * (identical in Edge-Git and Mail-Otter; the only two repos with queue
 * consumers).
 *
 * It rethrows after logging: a queue message that failed must be *retried* by
 * the platform, and a base that swallowed the rejection would turn a transient
 * handler failure into an acked, dropped message.
 */
interface WorkerMessageBatch<T = unknown> {
  messages: T[];
}

abstract class AbstractQueueWorker<T = unknown> {
  public async queue(batch: WorkerMessageBatch<T>, env: Env, ctx: WorkerExecutionContext): Promise<void> {
    try {
      await this.onQueue(batch, env, ctx);
    } catch (err: unknown) {
      console.error('Unhandled error in queue():', err);
      throw err;
    }
  }

  protected abstract onQueue(batch: WorkerMessageBatch<T>, env: Env, ctx: WorkerExecutionContext): Promise<void>;
}

export { AbstractQueueWorker };
export type { WorkerMessageBatch };
