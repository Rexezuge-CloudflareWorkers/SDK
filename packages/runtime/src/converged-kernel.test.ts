import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, isLogLevel, resetLogLevelForTests, resolveLogLevel, setLogLevel } from './logger.ts';
import { COOLDOWN_MS, FAILURE_THRESHOLD, KvCache, resetBreakerForTests } from './kv/KvCache.ts';
import { UNMETERED } from './kv/SubrequestMeterLike.ts';
import { digest128 } from './kv/KvDomains.ts';
import type { KvNamespaceLike } from './kv/KvCache.ts';
import type { SubrequestMeterLike } from './kv/SubrequestMeterLike.ts';

afterEach(() => {
  resetLogLevelForTests();
  resetBreakerForTests();
});

function meter(): { charge: (count?: number, kind?: string) => void; charged: string[] } {
  const spy = { charged: [] as string[], charge: (count = 1, kind?: string): void => void spy.charged.push(`${count}:${kind ?? ''}`) };
  return spy;
}

/**
 * A namespace whose every operation fails, so the breaker can be driven.
 */
function brokenNamespace(): KvNamespaceLike {
  return {
    get: (async (): Promise<string | null> => {
      throw new Error('KV down');
    }) as KvNamespaceLike['get'],
    put: async () => {
      throw new Error('KV down');
    },
    delete: async () => {
      throw new Error('KV down');
    },
    list: async () => ({ keys: [], list_complete: true }),
  } as unknown as KvNamespaceLike;
}

describe('createLogger level resolution', () => {
  it('reads the level per emit, not per construction', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = createLogger('unit');
    logger.debug('before');
    expect(debug).not.toHaveBeenCalled();

    setLogLevel('debug');
    logger.debug('after');
    // The defect this closes: the level used to be captured in the constructor, and
    // these loggers are built at module scope — long before a request scope existed
    // to hand them an `env`. `LOG_LEVEL=debug` shipped, was validated by nothing,
    // and was inert.
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it('lets an injected env outrank the installed level', () => {
    setLogLevel('debug');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createLogger('unit', undefined, { LOG_LEVEL: 'error' }).warn('suppressed');
    expect(warn).not.toHaveBeenCalled();
    createLogger('unit', undefined, { LOG_LEVEL: 'debug' }).warn('shown');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('floors an unrecognised installed level rather than throwing', () => {
    expect(() => setLogLevel('verbose')).not.toThrow();
    expect(resolveLogLevel()).toBe('info');
  });

  it('clears the installation when given something unusable', () => {
    setLogLevel('debug');
    setLogLevel(undefined);
    expect(resolveLogLevel()).toBe('info');
  });

  it('still recognises the four levels', () => {
    expect(['debug', 'info', 'warn', 'error'].every(isLogLevel)).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
  });
});

describe('KvCache circuit breaker', () => {
  it('opens after the threshold and then skips calls entirely', async () => {
    const ns = brokenNamespace();
    const cache = new KvCache(ns, UNMETERED);
    for (let attempt = 0; attempt < FAILURE_THRESHOLD; attempt += 1) {
      expect(await cache.getText('session', ['a'])).toBeNull();
    }
    const spy = vi.spyOn(ns, 'get');
    expect(await cache.getText('session', ['a'])).toBeNull();
    // Open means *no request at all*, not a request that fails: a hanging namespace
    // is the case a fail-soft wrapper alone does not cover.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('closes again after the cooldown', async () => {
    const ns = brokenNamespace();
    const cache = new KvCache(ns, UNMETERED);
    for (let attempt = 0; attempt < FAILURE_THRESHOLD; attempt += 1) {
      await cache.getText('session', ['a']);
    }
    expect(await cache.getText('session', ['a'])).toBeNull();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + COOLDOWN_MS + 1);
      expect(await cache.getText('session', ['a'])).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    // A half-open probe went out, which is what "recovers without a restart" means.
    expect(FAILURE_THRESHOLD).toBe(3);
  });

  it('does not consult a recovered namespace until the cooldown elapses, then closes for good', async () => {
    let fail = true;
    const get = vi.fn(async (): Promise<string | null> => {
      if (fail) throw new Error('KV down');
      return 'ok';
    });
    const ns = {
      get,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true }),
    } as unknown as KvNamespaceLike;
    const cache = new KvCache(ns, UNMETERED);
    for (let attempt = 0; attempt < FAILURE_THRESHOLD; attempt += 1) {
      await cache.getText('session', ['a']);
    }
    fail = false;

    // Still open: recovery is not observed while the breaker refuses to look.
    expect(await cache.getText('session', ['a'])).toBeNull();
    expect(get).toHaveBeenCalledTimes(FAILURE_THRESHOLD);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + COOLDOWN_MS + 1);
      // The half-open probe goes out, succeeds, and closes the breaker — so the
      // namespace is picked back up without a restart.
      expect(await cache.getText('session', ['a'])).toBe('ok');
      expect(await cache.getText('session', ['b'])).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
    expect(get).toHaveBeenCalledTimes(FAILURE_THRESHOLD + 2);
  });
});

describe('KvCache subrequest accounting', () => {
  it('charges one subrequest per issued operation', async () => {
    const ns = {
      get: async (): Promise<string | null> => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true }),
    } as unknown as KvNamespaceLike;
    const spy = meter();
    const cache = new KvCache(ns, spy as SubrequestMeterLike);
    await cache.getText('session', ['a']);
    await cache.putText('session', ['a'], 'v');
    await cache.del('session', ['a']);
    expect(spy.charged).toEqual(['1:kv', '1:kv', '1:kv']);
  });

  it('charges nothing when there is no binding', async () => {
    // Charging before the "is there a namespace" test would count a request that
    // was never made, which is the opposite of what failing soft should cost.
    const spy = meter();
    expect(await new KvCache(null, spy as SubrequestMeterLike).getText('session', ['a'])).toBeNull();
    expect(spy.charged).toEqual([]);
  });

  it('charges nothing while the breaker is open', async () => {
    const ns = brokenNamespace();
    const spy = meter();
    const cache = new KvCache(ns, spy as SubrequestMeterLike);
    for (let attempt = 0; attempt < FAILURE_THRESHOLD; attempt += 1) {
      await cache.getText('session', ['a']);
    }
    spy.charged.length = 0;
    await cache.getText('session', ['a']);
    expect(spy.charged).toEqual([]);
  });

  it('accepts a real SubrequestMeter without a cast', async () => {
    // The structural shape is what makes `@rexezuge/shared`'s counter usable here
    // while `runtime` stays a zero-dependency layer.
    const shared = {
      charge: vi.fn(),
      spent: 0,
      ceiling: 50,
      remaining: 50,
      exhausted: false,
      canAfford: () => true,
      setCeiling: () => {},
    };
    const cache = new KvCache(
      {
        get: async (): Promise<string | null> => null,
        put: async () => {},
        delete: async () => {},
        list: async () => ({ keys: [], list_complete: true }),
      } as unknown as KvNamespaceLike,
      shared,
    );
    await cache.getText('session', ['a']);
    expect(shared.charge).toHaveBeenCalledWith(1, 'kv');
  });
});

describe('digest128', () => {
  it('is not a 32-bit digest over a shared keyspace', () => {
    // Four independent lanes, because the longest KV keys embed a user-controlled
    // path or name: a 32-bit digest is collision-searchable, and someone who
    // controls names in their own scope could grind a colliding key.
    expect(digest128('a')).toHaveLength(32);
    expect(digest128('a')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic', () => {
    expect(digest128('songs:abc')).toBe(digest128('songs:abc'));
    expect(digest128('songs:abc')).not.toBe(digest128('songs:abd'));
  });
});
