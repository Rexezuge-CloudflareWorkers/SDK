import type { WorkerExecutionContext } from './AbstractEntrypointWorker.ts';
import { BASE_WORKER_MESSAGES } from './baseWorkerError.ts';

/**
 * The queue consumer base, converged from the `AbstractQueueWorker` copies in
 * Edge-Git and Mail-Otter (the only two repos with queue consumers).
 *
 * It rethrows after logging: a queue message that failed must be *retried* by
 * the platform, and a base that swallowed the rejection would turn a transient
 * handler failure into an acked, dropped message.
 *
 * **The batch is a type parameter, not a modelled shape.** This base never
 * reads the batch — it forwards it — so declaring a structural stand-in for it
 * bought nothing and cost correctness: the old `WorkerMessageBatch<T>` modelled
 * `messages: T[]`, which is wrong twice over (the platform's elements are
 * `Message<T>`, and a real batch also carries `queue`, `metadata`, `ackAll` and
 * `retryAll`). A consumer subclassing against that type lost `batch.queue` and
 * every `message.ack()`/`message.retry()`, and had to cast to get them back.
 *
 * Passing the platform `MessageBatch<Body>` as `TBatch` gives the handler the
 * full surface with no cast and no duplication of the platform's own types.
 */
abstract class AbstractQueueWorker<TBatch = unknown> {
  public async queue(batch: TBatch, env: Env, ctx: WorkerExecutionContext): Promise<void> {
    try {
      await this.onQueue(batch, env, ctx);
    } catch (err: unknown) {
      this.reportUnhandled(BASE_WORKER_MESSAGES.queue, err);
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

  protected abstract onQueue(batch: TBatch, env: Env, ctx: WorkerExecutionContext): Promise<void>;
}

export { AbstractQueueWorker };
