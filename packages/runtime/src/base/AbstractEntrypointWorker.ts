import { BASE_WORKER_MESSAGES } from './baseWorkerError.ts';

/**
 * Minimal Workers-compatible context types so backend-runtime typechecks
 * without @cloudflare/workers-types. Apps pass the real ExecutionContext /
 * ScheduledController which satisfy these structurally.
 *
 * Converged verbatim from `backend-runtime/src/base/AbstractEntrypointWorker.ts`
 * (identical in all nine repos).
 */
interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface WorkerScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

abstract class AbstractEntrypointWorker {
  /**
   * The HTTP request path.
   *
   * There is deliberately no `/__scheduled` branch here. It used to run before
   * `onRequest`, which made `GET /__scheduled` an unauthenticated, un-rated
   * trigger for the scheduled work: it bypassed the app's security headers, its
   * request scope, and its rate limits, and any caller could fire the cron
   * Durable Object on demand. `noRetry` was a `(): void => undefined` stub, so
   * the retry semantics were lost too.
   *
   * Nothing needed it — `scheduled()` is wired through the platform by the
   * `triggers.crons` entry in the wrangler config, which is how the cron
   * actually runs.
   */
  public async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    try {
      return await this.onRequest(request, env, ctx);
    } catch (err: unknown) {
      this.reportUnhandled(BASE_WORKER_MESSAGES.fetch, err);
      return new Response('Internal Error', { status: 500 });
    }
  }

  public async scheduled(event: WorkerScheduledController, env: Env, ctx: WorkerExecutionContext): Promise<void> {
    try {
      await this.onScheduled(event, env, ctx);
    } catch (err: unknown) {
      this.reportUnhandled(BASE_WORKER_MESSAGES.scheduled, err);
    }
  }

  /**
   * The sink for an unhandled rejection at this base's boundaries.
   *
   * Overridable because the default hands the caught value to `console.error`
   * verbatim, which is only safe when nothing in the call path can carry a
   * secret. A consumer whose entrypoint can transitively carry one overrides
   * this to a redacting sink, and keeps the static message as the argument, so
   * the redaction decision stays in the consumer where the threat model lives.
   */
  protected reportUnhandled(message: string, error: unknown): void {
    console.error(message, error);
  }

  protected abstract onRequest(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response>;

  protected abstract onScheduled(event: WorkerScheduledController, env: Env, ctx: WorkerExecutionContext): Promise<void>;
}

export { AbstractEntrypointWorker };
export type { WorkerExecutionContext, WorkerScheduledController };
