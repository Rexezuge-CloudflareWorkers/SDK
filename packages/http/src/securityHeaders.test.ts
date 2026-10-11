import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, securityHeaders, sensitivePaths } from './securityHeaders';
import type { HeaderContext } from './securityHeaders';

interface TestContext extends HeaderContext {
  applied: Record<string, string>;
}

function context(url: string, contentType: string): TestContext {
  const applied: Record<string, string> = {};
  return {
    applied,
    header: (name, value) => {
      applied[name] = value;
    },
    res: { headers: new Headers({ 'content-type': contentType }) },
    req: { url },
  };
}

describe('sensitivePaths', () => {
  it('matches only the prefixes it is given', () => {
    const isSensitive = sensitivePaths('/user');
    expect(isSensitive('/user/me')).toBe(true);
    expect(isSensitive('/repos/example')).toBe(false);
  });

  it('does not match a sibling that merely shares the prefix text', () => {
    // A substring check would make `/users` private because `/user` is private.
    const isSensitive = sensitivePaths('/user');
    expect(isSensitive('/users')).toBe(false);
  });

  it('accepts a prefix with or without a trailing slash', () => {
    expect(sensitivePaths('/user/')('/user/me')).toBe(true);
    expect(sensitivePaths('/user')('/user/me')).toBe(true);
  });

  it('protects nothing when given no prefixes', () => {
    // An honest empty answer. The failure to avoid is a predicate that looks
    // like it protected something and protects nothing.
    expect(sensitivePaths()('/user/me')).toBe(false);
  });

  it('composes, so a second private surface can be added', () => {
    const base = sensitivePaths('/user');
    const extended = (pathname: string): boolean => base(pathname) || pathname.startsWith('/internal/');
    expect(extended('/internal/metrics')).toBe(true);
    expect(extended('/user/me')).toBe(true);
  });
});

describe('applySecurityHeaders', () => {
  it('sets the baseline headers on every response', () => {
    const c = context('https://api.example.com/user/me', 'application/json');
    applySecurityHeaders(c, sensitivePaths('/user'));

    expect(c.applied['X-Content-Type-Options']).toBe('nosniff');
    expect(c.applied['X-Frame-Options']).toBe('DENY');
    expect(c.applied['Referrer-Policy']).toBe('same-origin');
    expect(c.applied['Origin-Agent-Cluster']).toBe('?1');
  });

  it('sends CSP for the HTML shell only', () => {
    const html = context('https://example.com/', 'text/html');
    applySecurityHeaders(html, sensitivePaths('/user'));
    expect(html.applied['Content-Security-Policy']).toContain("frame-ancestors 'none'");

    const json = context('https://example.com/user/me', 'application/json');
    applySecurityHeaders(json, sensitivePaths('/user'));
    expect(json.applied['Content-Security-Policy']).toBeUndefined();
  });

  it('sends no-store only where the caller said data is private', () => {
    const priv = context('https://example.com/user/me', 'application/json');
    applySecurityHeaders(priv, sensitivePaths('/user'));
    expect(priv.applied['Cache-Control']).toBe('no-store');

    const pub = context('https://example.com/repos/example', 'application/json');
    applySecurityHeaders(pub, sensitivePaths('/user'));
    expect(pub.applied['Cache-Control']).toBeUndefined();
  });

  it('sends HSTS over HTTPS only', () => {
    const secure = context('https://example.com/', 'text/html');
    applySecurityHeaders(secure, sensitivePaths('/user'));
    expect(secure.applied['Strict-Transport-Security']).toContain('max-age=31536000');

    const plain = context('http://localhost:8787/', 'text/html');
    applySecurityHeaders(plain, sensitivePaths('/user'));
    expect(plain.applied['Strict-Transport-Security']).toBeUndefined();
  });

  it('skips the no-store step rather than failing on an unparseable URL', () => {
    const c = context('not a url', 'application/json');
    expect(() => applySecurityHeaders(c, sensitivePaths('/user'))).not.toThrow();
    // The other headers still landed — one bad URL must not cost them.
    expect(c.applied['X-Frame-Options']).toBe('DENY');
  });
});

describe('securityHeaders middleware', () => {
  it('applies headers after the handler runs', async () => {
    const c = context('https://example.com/user/me', 'application/json');
    await securityHeaders(sensitivePaths('/user'))(c, async () => {
      expect(c.applied['X-Frame-Options']).toBeUndefined();
    });
    // After `next`, so a handler that sets its own header is not overwritten.
    expect(c.applied['X-Frame-Options']).toBe('DENY');
  });

  it('never fails a request when applying headers throws', async () => {
    const broken = {
      header: () => {
        throw new Error('context is gone');
      },
      res: { headers: new Headers() },
      req: { url: 'https://example.com/' },
    } as unknown as HeaderContext;

    await expect(securityHeaders(sensitivePaths('/user'))(broken, async () => undefined)).resolves.toBeUndefined();
  });
});
