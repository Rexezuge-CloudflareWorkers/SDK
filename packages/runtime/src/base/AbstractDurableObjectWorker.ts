import { DurableObject } from 'cloudflare:workers';

/**
 * The Durable Object base: one `fetch` entry, error containment inside it.
 *
 * Converged from the `AbstractDurableObjectWorker` copies in AWS-AccessBridge,
 * CalDAV-Bridge, ChordDHT-Tracker, Edge-Git, Mail-Meow and Mail-Otter (the
 * union is exactly Mail-Meow's shape: the fetch wrapper plus
 * `createExecutionContext` for handlers that need to forward `waitUntil`).
 * Durable-DAV's DO writes more context per handler, but the *base* is the same.
 *
 * A DO has no routing layer, so an unhandled rejection here would surface as a
 * raw 500 with no JSON body and no log. The catch is the boundary: it logs the
 * sanitized error and answers `{ error: 'Internal Error' }` so a caller always
 * gets a parseable response.
 */
abstract class AbstractDurableObjectWorker<TEnv = Env> extends DurableObject<TEnv> {
  public async fetch(request: Request): Promise<Response> {
    try {
      return await this.onRequest(request);
    } catch (err: unknown) {
      console.error('Unhandled error in durable object fetch():', err);
      return Response.json({ error: 'Internal Error' }, { status: 500 });
    }
  }

  /**
   * The platform `ExecutionContext` shape, forwards `waitUntil` into the DO's
   * own `ctx` so a handler can keep a task alive past the response.
   */
  protected createExecutionContext(): ExecutionContext {
    return {
      waitUntil: (promise: Promise<unknown>): void => this.ctx.waitUntil(promise),
      passThroughOnException: (): void => undefined,
    } as unknown as ExecutionContext;
  }

  protected abstract onRequest(request: Request): Promise<Response>;
}

export { AbstractDurableObjectWorker };
