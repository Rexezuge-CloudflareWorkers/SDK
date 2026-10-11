import { describe, expect, it, vi } from 'vitest';
import { Container } from './di/Container';
import type { Token } from './di/Container';
import { asScopedContext, getRequestScope, setRequestScope } from './di/RequestScope';
import { AppConfiguration } from './config/AppConfiguration';
import { EnvParser } from './config/EnvParser';
import { createLogger } from './logger';
import { KvCache } from './kv/KvCache';
import { buildKvKey, digest128 } from './kv/KvDomains';
import { AbstractEntrypointWorker } from './base/AbstractEntrypointWorker';
import type { WorkerExecutionContext } from './base/AbstractEntrypointWorker';

// ---------- DI container ----------

class Greeter {
  public constructor(public readonly greeting: string) {}
}

describe('Container', () => {
  it('returns a bound value', () => {
    const container = new Container();
    const token = 'greeting' as Token<string>;
    container.bindValue(token, 'hello');
    expect(container.get(token)).toBe('hello');
  });

  it('memoizes a factory into a singleton', () => {
    let built = 0;
    const container = new Container();
    const token = 'greeter' as Token<Greeter>;
    container.bind(token, (): Greeter => {
      built += 1;
      return new Greeter(`hi ${built}`);
    });
    const first = container.get(token);
    const second = container.get(token);
    expect(first).toBe(second);
    expect(built).toBe(1);
  });

  it('lets a factory resolve another token', () => {
    const container = new Container();
    const name = 'name' as Token<string>;
    const greeter = 'greeter' as Token<string>;
    container.bindValue(name, 'world');
    container.bind(greeter, (c): string => `hello ${c.get(name)}`);
    expect(container.get(greeter)).toBe('hello world');
  });

  it('reports an unbound token by name', () => {
    expect(() => new Container().get('missing' as Token<unknown>)).toThrow(/no binding for token: missing/);
  });

  it('knows what is bound', () => {
    const container = new Container();
    const token = 'x' as Token<number>;
    expect(container.has(token)).toBe(false);
    container.bindValue(token, 1);
    expect(container.has(token)).toBe(true);
  });

  it('rebinds over a previous binding', () => {
    const container = new Container();
    const token = 'v' as Token<number>;
    container.bindValue(token, 1);
    container.bindValue(token, 2);
    expect(container.get(token)).toBe(2);
  });
});

// ---------- request scope ----------

describe('RequestScope', () => {
  it('stores and retrieves the scope', () => {
    const store = new Map<string, unknown>();
    const ctx = asScopedContext({
      get: (key: string): unknown => store.get(key),
      set: (key: string, value: unknown): void => void store.set(key, value),
      env: {},
    });
    const scope = new Container();
    setRequestScope(ctx, scope);
    expect(getRequestScope(ctx)).toBe(scope);
  });

  it('fails closed when no scope was registered', () => {
    const ctx = asScopedContext({ get: (): unknown => undefined, set: (): void => undefined, env: {} });
    expect(() => getRequestScope(ctx)).toThrow(/Request scope is not set/);
  });
});

// ---------- config ----------

class TestConfig extends AppConfiguration {
  public constructor(env: unknown) {
    super(env);
  }

  public getMaxThings(): number {
    return EnvParser.positiveInt(this.raw(), 'MAX_THINGS', '10');
  }
}

describe('AppConfiguration', () => {
  it('strips trailing slashes from the site URL', () => {
    expect(new TestConfig({ SITE_URL: 'https://example.com/' }).getSiteUrl()).toBe('https://example.com');
    expect(new TestConfig({ SITE_URL: 'https://example.com///' }).getSiteUrl()).toBe('https://example.com');
    expect(new TestConfig({}).getSiteUrl()).toBe('http://localhost:8787');
  });

  it('parses typed env values through EnvParser', () => {
    expect(new TestConfig({ MAX_THINGS: '25' }).getMaxThings()).toBe(25);
    expect(new TestConfig({}).getMaxThings()).toBe(10);
    expect(new TestConfig({ MAX_THINGS: 'not-a-number' }).getMaxThings()).toBe(10);
  });

  it('warns about dev bypasses in production', () => {
    const warnings = new TestConfig({ ENVIRONMENT: 'production', DEMO_MODE: 'true', DEV_AUTH_EMAIL: 'a@b.c' }).validate();
    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain('DEMO_MODE');
    expect(warnings[1]).toContain('DEV_AUTH_EMAIL');
  });

  it('says nothing for a clean production config', () => {
    expect(new TestConfig({ ENVIRONMENT: 'production' }).validate()).toStrictEqual([]);
  });
});

describe('EnvParser', () => {
  it('reads booleans as presence of "true"', () => {
    expect(EnvParser.boolean({ FLAG: 'true' }, 'FLAG', 'false')).toBe(true);
    expect(EnvParser.boolean({ FLAG: 'TRUE' }, 'FLAG', 'false')).toBe(false);
    expect(EnvParser.boolean({}, 'FLAG', 'true')).toBe(true);
  });

  it('rejects a non-positive explicit int for validation but parses the default', () => {
    expect(EnvParser.isValidPositiveInt({ N: '-1' }, 'N')).toBe(false);
    expect(EnvParser.isValidPositiveInt({ N: '5' }, 'N')).toBe(true);
    expect(EnvParser.isValidPositiveInt({}, 'N')).toBe(true);
    expect(EnvParser.positiveInt({ N: '0' }, 'N', '7')).toBe(7);
  });
});

// ---------- worker bases ----------

class OkWorker extends AbstractEntrypointWorker {
  public lastScheduled: string | null = null;

  protected async onRequest(): Promise<Response> {
    return new Response('ok');
  }

  protected async onScheduled(event: { cron: string }): Promise<void> {
    this.lastScheduled = event.cron;
  }
}

class BoomWorker extends AbstractEntrypointWorker {
  protected async onRequest(): Promise<Response> {
    throw new Error('boom');
  }

  protected async onScheduled(): Promise<void> {
    throw new Error('scheduled boom');
  }
}

const ctx: WorkerExecutionContext = { waitUntil: (): void => undefined, passThroughOnException: (): void => undefined };

describe('AbstractEntrypointWorker', () => {
  it('passes a good response through', async () => {
    expect(await new OkWorker().fetch(new Request('https://x/'), {}, ctx)).toBeInstanceOf(Response);
  });

  it('contains a request failure as a 500', async () => {
    const response = await new BoomWorker().fetch(new Request('https://x/'), {}, ctx);
    expect(response.status).toBe(500);
  });

  it('contains a scheduled failure without rethrowing', async () => {
    const worker = new BoomWorker();
    await expect(worker.scheduled({ cron: '* * * * *', scheduledTime: 0, noRetry: (): void => undefined }, {}, ctx)).resolves.toBeUndefined();
  });

  it('routes a good scheduled call to onScheduled', async () => {
    const worker = new OkWorker();
    await worker.scheduled({ cron: '*/10 * * * *', scheduledTime: 0, noRetry: (): void => undefined }, {}, ctx);
    expect(worker.lastScheduled).toBe('*/10 * * * *');
  });
});

// ---------- logger ----------

describe('createLogger', () => {
  it('emits at or above the floor and suppresses below it', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('svc', 'repo', { LOG_LEVEL: 'error' });
    logger.debug('nope');
    logger.error('yep');
    expect(debug).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[repo] [svc]'), 'yep');
    debug.mockRestore();
    error.mockRestore();
  });

  it('falls back to info on an unknown level', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    createLogger(undefined, undefined, { LOG_LEVEL: 'verbose' }).debug('x');
    createLogger(undefined, undefined, { LOG_LEVEL: 'verbose' }).info('y');
    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
    debug.mockRestore();
  });
});

// ---------- kv ----------

class FakeNamespace {
  public readonly store = new Map<string, { value: string | ArrayBuffer; options?: { expirationTtl?: number; metadata?: unknown } }>();
  public failNext = false;

  public async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry === undefined ? null : typeof entry.value === 'string' ? entry.value : null;
  }

  public async getWithMetadata(key: string): Promise<{ value: string | ArrayBuffer | null; metadata: unknown }> {
    const entry = this.store.get(key);
    return { value: entry?.value ?? null, metadata: entry?.options?.metadata ?? null };
  }

  public async put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('kv down');
    }
    this.store.set(key, { value, options });
  }

  public async delete(key: string): Promise<unknown> {
    this.store.delete(key);
    return undefined;
  }

  public async list(options: { prefix: string; limit?: number }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }> {
    const keys = [...this.store.keys()].filter((key) => key.startsWith(options.prefix)).map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

describe('KvCache', () => {
  it('round-trips text and json', async () => {
    const cache = new KvCache(new FakeNamespace());
    expect(await cache.putText('session', ['u1'], 'payload')).toBe(true);
    expect(await cache.getText('session', ['u1'])).toBe('payload');
    await cache.putJson('metadata', ['u1'], { a: 1 });
    expect(await cache.getJson<{ a: number }>('metadata', ['u1'])).toStrictEqual({ a: 1 });
  });

  it('is fail-soft: no binding, backend error, and oversize values', async () => {
    const empty = new KvCache(null);
    expect(empty.available).toBe(false);
    expect(await empty.getText('session', ['x'])).toBeNull();
    expect(await empty.putText('session', ['x'], 'v')).toBe(false);

    const ns = new FakeNamespace();
    const cache = new KvCache(ns);
    ns.failNext = true;
    expect(await cache.putText('session', ['x'], 'v')).toBe(false);
    expect(await cache.getText('session', ['x'])).toBeNull();

    const big = 'x'.repeat(70_000);
    expect(await cache.putText('session', ['x'], big)).toBe(false);
  });

  it('round-trips binary entries with metadata', async () => {
    const cache = new KvCache(new FakeNamespace());
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await cache.putBinary('asset', ['f1'], bytes, { etag: 'e1', contentType: 'text/plain' })).toBe(true);
    const entry = await cache.getBinary('asset', ['f1']);
    expect(entry?.bytes).toStrictEqual(bytes);
    expect(entry?.metadata).toStrictEqual({ etag: 'e1', contentType: 'text/plain' });
  });

  it('refuses a binary write without an etag', async () => {
    const cache = new KvCache(new FakeNamespace());
    expect(await cache.putBinary('asset', ['f1'], new Uint8Array([1]), { etag: '', contentType: null })).toBe(false);
  });

  it('deletes and purges by prefix', async () => {
    const ns = new FakeNamespace();
    const cache = new KvCache(ns);
    await cache.putText('session', ['u1'], 'a');
    await cache.putText('session', ['u2'], 'b');
    await cache.putText('metadata', ['u1'], 'c');
    expect(await cache.purgePrefix('session')).toBe(2);
    expect(await cache.getText('metadata', ['u1'])).toBe('c');
    await cache.del('metadata', ['u1']);
    expect(await cache.getText('metadata', ['u1'])).toBeNull();
  });

  it('builds namespaced keys and rejects unknown domains', () => {
    expect(buildKvKey('session', ['u1'])).toBe('session:v1:u1');
    expect(() => buildKvKey('nope' as 'session', ['x'])).toThrow(/Unknown KV domain/);
    expect(() => buildKvKey('session', [])).toThrow(/at least one key part/);
    expect(() => buildKvKey('session', [' '])).toThrow(/must not be empty/);
  });

  it('falls back to a digest for oversized keys', () => {
    const key = buildKvKey('asset', ['x'.repeat(600)]);
    expect(key.startsWith('asset:v1:h:')).toBe(true);
    expect(digest128('abc')).toMatch(/^[a-f0-9]{32}$/);
    expect(digest128('abc')).not.toBe(digest128('abd'));
  });
});
