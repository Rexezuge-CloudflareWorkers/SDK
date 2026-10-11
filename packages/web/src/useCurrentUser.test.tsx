// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { ServiceError } from '@rexezuge/errors';
import { createApiClient } from './api';
import type { ApiClient, FetchFn } from './api';
import { useCurrentUser } from './useCurrentUser';

interface Account {
  email: string;
  preferredLanguage?: string | null;
}

afterEach(cleanup);

function clientReturning(body: unknown): ApiClient {
  const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify(body), { status: 200 }));
  return createApiClient(fetchMock);
}

describe('useCurrentUser', () => {
  it('loads the account on mount and clears the loading flag', async () => {
    const client = clientReturning({ email: 'dev@example.test' });
    const { result } = renderHook(() => useCurrentUser<Account>(client));

    // The request is in flight from the first render, so `loading` starts true.
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.user).toEqual({ email: 'dev@example.test' });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('requests the profile path it was given', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({}), { status: 200 }));
    const client = createApiClient(fetchMock);
    renderHook(() => useCurrentUser(client, { path: '/user/me?verbose=1' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/user/me?verbose=1');
  });

  it('reports a failure as a ServiceError and leaves the user null', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ Exception: { Message: 'D1 is down.' } }), { status: 500 }));
    const client = createApiClient(fetchMock);
    const { result } = renderHook(() => useCurrentUser<Account>(client));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(ServiceError);
    expect(result.current.error?.status).toBe(500);
    expect(result.current.error?.message).toBe('D1 is down.');
  });

  it('normalizes a failure thrown by a client that is not this package', async () => {
    // A caller may hand in any object with the same shape; a raw throw still
    // has to come back as a ServiceError.
    const rogue = {
      get: async () => {
        throw new Error('offline');
      },
    } as unknown as ApiClient;
    const { result } = renderHook(() => useCurrentUser<Account>(rogue));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBeInstanceOf(ServiceError);
    expect(result.current.error?.message).toBe('offline');
  });

  it('re-runs the request when reload is called', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ email: 'a@example.test' }), { status: 200 }));
    const client = createApiClient(fetchMock);
    const { result } = renderHook(() => useCurrentUser<Account>(client));

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.reload();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.user).toEqual({ email: 'a@example.test' });
  });

  it('does not re-fetch when a fresh client instance is passed', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ email: 'a@example.test' }), { status: 200 }));
    const { rerender } = renderHook(() => useCurrentUser<Account>(createApiClient(fetchMock)));

    await act(async () => {
      await Promise.resolve();
    });
    rerender();
    await act(async () => {
      await Promise.resolve();
    });
    // A new client identity must not storm the profile route.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
