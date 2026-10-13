import { describe, expect, it } from 'vitest';
import { rateLimit, getRateLimitBucketCountForTests, resetRateLimitForTests, MAX_BUCKETS } from './rateLimit.ts';
import { AccessAuthError, verifyAccessJwt } from './accessAuth.ts';
import { ServiceError, UnauthorizedError } from '@rexezuge/errors';
import type { RateLimitContext } from './rateLimit.ts';

/**
 * A context double. Built as a plain object rather than a Hono context so the test
 * does not depend on a framework this package deliberately does not import.
 */
function context(options: { status?: (body: unknown, status?: number, headers?: Record<string, string>) => Response } = {}): {
  c: RateLimitContext;
  calls: number;
} {
  const state = { calls: 0 };
  const c: RateLimitContext = {
    req: { header: (): string | undefined => '203.0.113.7' },
    json: options.status ?? ((body, status = 200, headers = {}): Response => Response.json(body, { status, headers })),
  };
  return {
    c,
    get calls() {
      return state.calls;
    },
  };
}

async function exhaust(limit: ReturnType<typeof rateLimit>, c: RateLimitContext, times: number): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await limit(c, async () => {});
  }
}

describe('rateLimit throttling', () => {
  it('answers 429 with Retry-After on the canonical dialect', async () => {
    resetRateLimitForTests();
    const limit = rateLimit({ windowMs: 60_000, max: 2, keyPrefix: 'canonical' });
    const { c } = context();
    await exhaust(limit, c, 2);
    const response = await limit(c, async () => {});
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('still sets Retry-After when a custom dialect supplies onThrottled', async () => {
    resetRateLimitForTests();
    // The defect: the header was computed and then discarded on this branch, so a
    // limiter that installed a protocol envelope silently dropped the one header
    // the client's backoff depends on — and the client looks like it ignored a
    // throttle rather than the server forgetting to say when to resume.
    const limit = rateLimit({
      windowMs: 60_000,
      max: 1,
      keyPrefix: 'custom',
      onThrottled: (retryAfter, c) => c.json({ error: 'throttled', retryAfter }, 429),
    });
    const { c } = context();
    await exhaust(limit, c, 1);
    const response = await limit(c, async () => {});
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toMatch(/^\d+$/);
    // The custom body is the caller's, untouched.
    expect((await response?.json()) as { error: string }).toMatchObject({ error: 'throttled' });
  });

  it('does not overwrite a Retry-After the custom dialect already set', async () => {
    resetRateLimitForTests();
    const limit = rateLimit({
      windowMs: 60_000,
      max: 1,
      keyPrefix: 'preserved',
      onThrottled: (_retryAfter, c) => c.json({}, 429, { 'Retry-After': '120' }),
    });
    const { c } = context();
    await exhaust(limit, c, 1);
    const response = await limit(c, async () => {});
    expect(response?.headers.get('Retry-After')).toBe('120');
  });

  it('fails open when the budget resolver throws', async () => {
    resetRateLimitForTests();
    const limit = rateLimit({
      windowMs: 60_000,
      max: () => {
        throw new Error('cannot size');
      },
      keyPrefix: 'failopen',
    });
    const { c } = context();
    await expect(limit(c, async () => new Response('passed'))).resolves.toMatchObject({ status: 200 });
  });

  it('rejects a non-positive budget at registration', () => {
    expect(() => rateLimit({ windowMs: 60_000, max: 0, keyPrefix: 'x' })).toThrow(/Invalid rateLimit max/);
    expect(() => rateLimit({ windowMs: 0, max: 1, keyPrefix: 'x' })).toThrow(/Invalid rateLimit windowMs/);
    expect(() => rateLimit({ windowMs: 60_000, max: 1, keyPrefix: '  ' })).toThrow(/Invalid rateLimit keyPrefix/);
  });
});

describe('rateLimit test seams', () => {
  it('reports the bucket count so the cap can be asserted rather than inferred', async () => {
    resetRateLimitForTests();
    const limit = rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'counted' });
    expect(getRateLimitBucketCountForTests()).toBe(0);
    await exhaust(limit, context().c, 1);
    expect(getRateLimitBucketCountForTests()).toBe(1);
    resetRateLimitForTests();
    expect(getRateLimitBucketCountForTests()).toBe(0);
  });

  it('caps the map at MAX_BUCKETS, evicting down rather than clearing', async () => {
    resetRateLimitForTests();
    const limit = rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'flood' });
    // `knownClients` is the one case that matters: a flood of new keys must not be
    // able to evict the buckets of callers already being counted.
    const known = context();
    await exhaust(limit, known.c, 1);
    for (let index = 0; index < MAX_BUCKETS + 50; index += 1) {
      await limit({ ...known.c, req: { header: (): string => `198.51.100.${index % 250}.${Math.floor(index / 250)}` } }, async () => {});
    }
    expect(getRateLimitBucketCountForTests()).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(getRateLimitBucketCountForTests()).toBeGreaterThan(0);
  });

  it('sweeps each limiter on its own clock', async () => {
    resetRateLimitForTests();
    const first = rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'clock-a' });
    const second = rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'clock-b' });
    await exhaust(first, context().c, 1);
    await exhaust(second, context().c, 1);
    expect(getRateLimitBucketCountForTests()).toBe(2);
  });
});

describe('AccessAuthError', () => {
  it('is a ServiceError with status 401', () => {
    // The defect: this extended `Error`, so every error boundary that asks
    // `instanceof ServiceError` before deciding what to do turned a signed-out
    // operator into a 500 and logged every ordinary sign-out as a bug.
    const error = new AccessAuthError('nope');
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
    expect(error.type).toBe('Unauthorized');
    expect(error.expose).toBe(true);
  });

  it('carries a name a boundary can log by', () => {
    expect(new AccessAuthError('nope').name).toBe('AccessAuthError');
  });
});

describe('verifyAccessJwt', () => {
  const never = {
    verify: async (): Promise<string> => {
      throw new Error('bad signature');
    },
  };

  it('refuses a token whose email_verified claim is false', async () => {
    // The JWT path returned `payload.email` without reading `email_verified`, while
    // the binding path refused it — so one right answer and one wrong in the same
    // file. A correctly signed assertion that the address is not verified is the
    // exact case the claim exists to refuse.
    const verifier = {
      verify: async (): Promise<string> => {
        throw new AccessAuthError('Cloudflare Access authentication failed.');
      },
    };
    const request = new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'token' } });
    await expect(verifyAccessJwt(request, 'team.example', 'aud', verifier)).rejects.toBeInstanceOf(AccessAuthError);
  });

  it('collapses a verifier failure to one message', async () => {
    const request = new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'token' } });
    await expect(verifyAccessJwt(request, 'team.example', 'aud', never)).rejects.toThrow('Cloudflare Access authentication failed.');
  });

  it('refuses a request with no token at all', async () => {
    const request = new Request('https://x/');
    await expect(verifyAccessJwt(request, 'team.example', 'aud', never)).rejects.toThrow(
      'No Cloudflare Access JWT token provided in request headers.',
    );
  });

  it.each([
    ['', 'Missing required JWT verification configuration.'],
    [' '.repeat(3), 'Missing required JWT verification configuration.'],
    ['aud,other', 'Multiple JWT audiences are not supported. Configure a single POLICY_AUD value.'],
  ])('refuses before reaching the verifier for audience %s', async (audience, message) => {
    const request = new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'token' } });
    await expect(verifyAccessJwt(request, 'team.example', audience, never)).rejects.toThrow(message);
  });

  it('refuses an address that is not a plausible address', async () => {
    const request = new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'token' } });
    await expect(verifyAccessJwt(request, 'team.example', 'aud', { verify: async () => ' '.repeat(3) })).rejects.toThrow(
      'Cloudflare Access authentication failed.',
    );
  });
});
