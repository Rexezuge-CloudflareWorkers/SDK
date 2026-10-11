import { describe, expect, it, vi } from 'vitest';
import { InternalServerError, NotFoundError, ServiceError, UnauthorizedError } from '@rexezuge/errors';
import { buildQuery, createApiClient, HttpStatusError, MAX_ERROR_MESSAGE_LENGTH } from './api';
import type { FetchFn } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function textResponse(text: string, status: number, contentType = 'text/html'): Response {
  return new Response(text, { status, headers: { 'Content-Type': contentType } });
}

/** The `fetch` call a client made, as its two arguments. */
function recordedCall(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('the client never called fetch');
  }
  const [url, init] = call;
  return { url, init: init ?? {} };
}

describe('createApiClient', () => {
  it('sends a GET with an Accept header and no body', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ id: 'a' }));
    const client = createApiClient(fetchMock);

    await client.get<{ id: string }>('/thing');

    const { url, init } = recordedCall(fetchMock);
    expect(url).toBe('/thing');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.body).toBeUndefined();
  });

  it('prefixes every path with the configured base URL', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({}));
    const client = createApiClient(fetchMock, { baseUrl: '/user' });

    await client.get<unknown>('/me');

    expect(recordedCall(fetchMock).url).toBe('/user/me');
  });

  it('serializes a body as JSON with a matching content type', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ ok: true }));
    const client = createApiClient(fetchMock);

    await client.post<unknown>('/things', { name: 'bucket' });

    const { init } = recordedCall(fetchMock);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'bucket' }));
  });

  it('sends the method each helper names, with an optional body', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({}));
    const client = createApiClient(fetchMock);

    await client.put<unknown>('/things/1', { name: 'renamed' });
    await client.patch<unknown>('/things/1', { name: 'patched' });
    await client.delete<unknown>('/things/1');

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'PATCH', 'DELETE']);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'renamed' }));
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBeUndefined();
  });

  it('merges the client headers and lets a request override them', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({}));
    const client = createApiClient(fetchMock, { headers: { 'X-Trace': 'client', Accept: 'text/plain' }, credentials: 'include' });

    await client.request<unknown>('/thing', { headers: { 'X-Trace': 'request' } });

    const { init } = recordedCall(fetchMock);
    expect(new Headers(init.headers).get('X-Trace')).toBe('request');
    expect(new Headers(init.headers).get('Accept')).toBe('text/plain');
    expect(init.credentials).toBe('include');
  });

  it('parses a JSON response body', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ id: 'a', name: 'Account' }));
    const client = createApiClient(fetchMock);

    await expect(client.get<{ id: string; name: string }>('/account')).resolves.toEqual({ id: 'a', name: 'Account' });
  });

  it('resolves to undefined for a 204 and for an empty body', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(null, { status: 204 }));
    const client = createApiClient(fetchMock);

    await expect(client.delete<void>('/things/1')).resolves.toBeUndefined();

    fetchMock.mockImplementation(async () => textResponse('', 200, 'application/json'));
    await expect(client.get<void>('/things')).resolves.toBeUndefined();
  });

  it('rejects a 2xx body that is not JSON with a ServiceError, not a SyntaxError', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => textResponse('<html><body>Proxy error</body></html>', 200));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).message).toContain('Malformed response body: GET /thing');
  });

  it('normalizes a 500 envelope into the taxonomy class, with the server message', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ Exception: { Type: 'InternalError', Message: 'D1 exploded.' } }, 500));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).status).toBe(500);
    expect((error as ServiceError).message).toBe('D1 exploded.');
  });

  it('normalizes a 401 into UnauthorizedError', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ Exception: { Type: 'Unauthorized', Message: 'Session expired.' } }, 401));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/me').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as ServiceError).status).toBe(401);
    expect((error as ServiceError).message).toBe('Session expired.');
  });

  it('reads the legacy error shape rather than falling back to the catalog', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ error: 'NotFound', message: 'No such bucket.' }, 404));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/buckets/x').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as ServiceError).message).toBe('No such bucket.');
  });

  it('reads a nested error object', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ error: { code: 'Conflict', message: 'Name is taken.' } }, 409));
    const client = createApiClient(fetchMock);

    const error = await client.post<unknown>('/things', { name: 'x' }).catch((cause: unknown) => cause);
    expect((error as ServiceError).status).toBe(409);
    expect((error as ServiceError).message).toBe('Name is taken.');
  });

  it('keeps the status for a code the catalog has no class for', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ Exception: { Type: 'UnavailableForLegalReasons' } }, 451));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpStatusError);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).status).toBe(451);
    expect((error as ServiceError).type).toBe('UnavailableForLegalReasons');
    expect((error as ServiceError).message).toBe('UnavailableForLegalReasons (HTTP 451)');
  });

  it('reports an HTML error page as absent rather than quoting it', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => textResponse('<html><head><title>Access Login</title></head></html>', 502));
    const client = createApiClient(fetchMock, { baseUrl: '/user' });

    const error = await client.get<unknown>('/me').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).status).toBe(502);
    // The catalog's 502 default, not the markup.
    expect((error as ServiceError).message).toBe('The server received an invalid response from an upstream service.');
  });

  it('surfaces a short plain-text error body', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => textResponse('Upstream timed out.', 504, 'text/plain'));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect((error as ServiceError).message).toBe('Upstream timed out.');
  });

  it('truncates a long server message', async () => {
    const long = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH + 250);
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({ Exception: { Message: long } }, 400));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect((error as ServiceError).message).toHaveLength(MAX_ERROR_MESSAGE_LENGTH + 1);
    expect((error as ServiceError).message.endsWith('…')).toBe(true);
  });

  it('falls back to the catalog message when the body says nothing', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => textResponse('', 503));
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect((error as ServiceError).message).toBe('The server is currently unable to handle the request — retry after a delay.');
  });

  it('normalizes a transport failure through ServiceError.from', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createApiClient(fetchMock);

    const error = await client.get<unknown>('/thing').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).status).toBe(500);
    expect((error as ServiceError).message).toBe('Failed to fetch');
  });

  it('appends the query string to a GET', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = createApiClient(fetchMock, { baseUrl: '/user' });

    await client.get<unknown[]>('/logs', { limit: 25, cursor: 'abc' });

    expect(recordedCall(fetchMock).url).toBe('/user/logs?limit=25&cursor=abc');
  });

  it('forwards a caller method and signal through request', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => jsonResponse({}));
    const client = createApiClient(fetchMock);
    const controller = new AbortController();

    await client.request<unknown>('/thing', { method: 'DELETE', signal: controller.signal });

    const { init } = recordedCall(fetchMock);
    expect(init.method).toBe('DELETE');
    expect(init.signal).toBe(controller.signal);
  });
});

describe('buildQuery', () => {
  it('returns an empty string when there is nothing to send', () => {
    expect(buildQuery({})).toBe('');
    expect(buildQuery({ a: undefined, b: null, c: '' })).toBe('');
  });

  it('prefixes a question mark and stringifies values', () => {
    expect(buildQuery({ page: 2, live: true, q: 'a b' })).toBe('?page=2&live=true&q=a+b');
  });

  it('repeats the key for an array value, dropping its blanks', () => {
    expect(buildQuery({ tag: ['x', '', 'y', undefined] })).toBe('?tag=x&tag=y');
  });
});
