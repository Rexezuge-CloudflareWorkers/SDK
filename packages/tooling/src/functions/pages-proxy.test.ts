import { describe, expect, it } from 'vitest';
import { createPagesProxy } from './pages-proxy';
import type { PagesProxyEnv } from './pages-proxy';

function fakeEnv(): { env: PagesProxyEnv; seen: { url: string; method: string; headers: Headers; body: string | null }[] } {
  const seen: { url: string; method: string; headers: Headers; body: string | null }[] = [];
  const env: PagesProxyEnv = {
    API_WORKER: {
      async fetch(request: Request): Promise<Response> {
        seen.push({
          url: request.url,
          method: request.method,
          headers: new Headers(request.headers),
          body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.text(),
        });
        return new Response('ok', { status: 200 });
      },
    },
  };
  return { env, seen };
}

const onRequest = createPagesProxy();

describe('createPagesProxy', () => {
  it('forwards the URL verbatim and rewrites the three X-Forwarded headers', async () => {
    const { env, seen } = fakeEnv();
    const request = new Request('https://pages.example.com/user/volumes?page=2', { method: 'GET' });
    const response = await onRequest({ request, env } as never);
    expect(response.status).toBe(200);
    expect(seen[0]?.url).toBe('https://pages.example.com/user/volumes?page=2');
    expect(seen[0]?.headers.get('X-Forwarded-Host')).toBe('pages.example.com');
    expect(seen[0]?.headers.get('X-Forwarded-Proto')).toBe('https');
    expect(seen[0]?.headers.get('X-Forwarded-Uri')).toBe('/user/volumes?page=2');
  });

  it('forwards a body for non-GET/HEAD', async () => {
    const { env, seen } = fakeEnv();
    await onRequest({
      request: new Request('https://pages.example.com/user/volumes', { method: 'PUT', body: '{"a":1}' }),
      env,
    } as never);
    expect(seen[0]?.body).toBe('{"a":1}');
  });

  it('replaces X-Forwarded-For from CF-Connecting-IP, never trusting a caller value', async () => {
    const { env, seen } = fakeEnv();
    // The client IP arrives as a request header (the edge sets it), and any
    // caller-supplied X-Forwarded-For must be displaced by it, never kept.
    const headers = new Headers({ 'X-Forwarded-For': '1.2.3.4', 'CF-Connecting-IP': '9.9.9.9' });
    await onRequest({ request: new Request('https://pages.example.com/', { headers }), env } as never);
    expect(seen[0]?.headers.get('X-Forwarded-For')).toBe('9.9.9.9');
  });

  it('strips hop-by-hop and client-forwarding headers', async () => {
    const { env, seen } = fakeEnv();
    const headers = new Headers({
      Connection: 'keep-alive',
      'Proxy-Authorization': 'Basic x',
      Forwarded: 'for=1.2.3.4',
      'X-Real-Ip': '1.2.3.4',
      'True-Client-IP': '1.2.3.4',
    });
    await onRequest({ request: new Request('https://pages.example.com/', { headers }), env } as never);
    const forwarded = seen[0]?.headers;
    expect(forwarded?.get('Connection')).toBeNull();
    expect(forwarded?.get('Proxy-Authorization')).toBeNull();
    expect(forwarded?.get('Forwarded')).toBeNull();
    expect(forwarded?.get('X-Real-Ip')).toBeNull();
    expect(forwarded?.get('True-Client-IP')).toBeNull();
  });
});
