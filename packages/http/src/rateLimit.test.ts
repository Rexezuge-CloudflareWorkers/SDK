import { describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimit } from './rateLimit.ts';
import type { RateLimitContext } from './rateLimit.ts';

/**
 * A structural `RateLimitContext` double.
 *
 * The package deliberately takes a context *shape* rather than Hono's
 * `Context<…>`, so the suite needs no framework and runs in plain Node — which
 * is the point of the split: the bucket arithmetic and the fail-open paths are
 * the parts worth testing, and they are all here.
 */
function context(ip: string | undefined = '203.0.113.7', identity?: string): RateLimitContext & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const variables = new Map<string, unknown>();
  if (identity !== undefined) variables.set('AuthenticatedUserEmailAddress', identity);
  return {
    headers,
    req: { header: (name: string) => (name === 'CF-Connecting-IP' ? ip : undefined) },
    get: (key: string) => variables.get(key),
    json: (body: unknown, status = 200, extra?: Record<string, string>) => {
      for (const [key, value] of Object.entries(extra ?? {})) headers[key] = value;
      return Response.json(body, { status, headers });
    },
  };
}

const OPTS = { windowMs: 60_000, max: 2, keyPrefix: 'test' } as const;

/**
Run the handler `times` times against one context; the last response wins.
*/
async function hit(handler: ReturnType<typeof rateLimit>, c: RateLimitContext, times: number): Promise<Response> {
  let last = new Response(null, { status: 200 });
  for (let index = 0; index < times; index += 1) {
    last = (await handler(c, async () => new Response('ok', { status: 200 }))) as Response;
  }
  return last;
}

describe('clientIp', () => {
  it('trusts CF-Connecting-IP and nothing else', () => {
    expect(clientIp((name) => (name === 'CF-Connecting-IP' ? '198.51.100.9' : undefined))).toBe('198.51.100.9');
  });

  it('falls back to a shared bucket when the header is absent', () => {
    // Fail-closed grouping: without a trusted address every caller shares one
    // bucket rather than getting per-spoofed-header isolation.
    expect(clientIp(() => {})).toBe('unknown');
  });

  it('ignores a spoofable forwarding header entirely', () => {
    expect(clientIp((name) => (name === 'X-Forwarded-For' ? '10.0.0.1' : undefined))).toBe('unknown');
  });

  it('trims whitespace', () => {
    expect(clientIp(() => '  203.0.113.7  ')).toBe('203.0.113.7');
  });
});

describe('rateLimit: registration', () => {
  it('rejects a non-positive window', () => {
    expect(() => rateLimit({ ...OPTS, windowMs: 0 })).toThrow(/windowMs/);
  });

  it('rejects a non-positive static max', () => {
    expect(() => rateLimit({ ...OPTS, max: 0 })).toThrow(/max/);
  });

  it('rejects an empty keyPrefix', () => {
    expect(() => rateLimit({ ...OPTS, keyPrefix: '  ' })).toThrow(/keyPrefix/);
  });

  it('accepts a resolver without calling it — env does not exist at registration', () => {
    // The whole reason `max` may be a resolver: the route table is built in the
    // worker constructor, where `c.env` is not there yet. A limiter that read
    // it there would be a module constant wearing a variable's name.
    const resolver = vi.fn(() => 5);
    expect(() => rateLimit({ ...OPTS, max: resolver })).not.toThrow();
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('rateLimit: counting', () => {
  it('allows up to max, then throttles', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'count' });
    const c = context();
    await hit(handler, c, 2);
    const third = await hit(handler, c, 1);
    expect(third.status).toBe(429);
  });

  it('sets Retry-After so a client knows how long to wait', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'retry' });
    const c = context();
    await hit(handler, c, 3);
    expect(c.headers['Retry-After']).toMatch(/^\d+$/);
    expect(Number(c.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('answers in the family envelope so one surface has one dialect', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'dialect' });
    const response = await hit(handler, context(), 3);
    const body = (await response.json()) as { Exception: { Type: string; Message: string } };
    // A surface with its own envelope supplies `onThrottled`; without one it
    // gets the canonical `{Exception:{…}}` every SPA in the family decodes.
    expect(body.Exception.Type).toBe('RateLimited');
    expect(body.Exception.Message).toMatch(/Retry after \d+s/);
  });

  it('keys on the resolved identity when auth ran first', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'identity' });
    const a = context('203.0.113.1', 'ops@example.com');
    const b = context('203.0.113.2', 'ops@example.com');
    // Same operator behind two addresses: one shared budget.
    await hit(handler, a, 2);
    expect((await hit(handler, b, 1)).status).toBe(429);
  });

  it('keys on the address when no identity is present', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'anon' });
    const c = context();
    await hit(handler, c, 2);
    expect((await hit(handler, c, 1)).status).toBe(429);
  });

  it('gives a different prefix its own budget', async () => {
    const c = context();
    await hit(rateLimit({ ...OPTS, keyPrefix: 'p1' }), c, 2);
    expect((await hit(rateLimit({ ...OPTS, keyPrefix: 'p2' }), c, 1)).status).toBe(200);
  });
});

describe('rateLimit: fail-open', () => {
  it('fails open when the resolver throws — never turns the limiter off', async () => {
    const handler = rateLimit({
      ...OPTS,
      keyPrefix: 'throwing',
      max: () => {
        throw new Error('env not ready');
      },
    });
    // A broken resolver must not produce an unlimited bucket silently; it must
    // reach the fail-open path, which allows the request rather than 500ing it.
    expect((await hit(handler, context(), 1)).status).toBe(200);
  });

  it('fails open when the resolver answers a non-positive integer', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'nan', max: () => NaN });
    expect((await hit(handler, context(), 1)).status).toBe(200);
  });

  it('runs next() exactly once per request', async () => {
    const handler = rateLimit({ ...OPTS, keyPrefix: 'once', max: () => NaN });
    const next = vi.fn(async () => new Response('ok'));
    await handler(context(), next);
    // Hono's compose throws on a second next() call; a fail-open branch that
    // enclosed next() would surface as "next() called multiple times".
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('rateLimit: custom dialect', () => {
  it('defers to a surface-specific 429 when one is supplied', async () => {
    const handler = rateLimit({
      ...OPTS,
      keyPrefix: 'subsonic',
      onThrottled: (retryAfter) => new Response(`code=50 retry=${retryAfter}`, { status: 429 }),
    });
    const response = await hit(handler, context(), 3);
    expect(response.status).toBe(429);
    expect(await response.text()).toContain('code=50');
  });
});
