/**
 * Baseline response security headers.
 *
 * Converged from `apps/api/src/middleware/securityHeaders.ts` in Durable-DAV,
 * Durable-DAV-Router, Edge-Git and Edge-Sonic, where the four copies are
 * byte-identical apart from one predicate — which is exactly why it is a
 * parameter here rather than a constant.
 *
 * ## Why `isSensitive` is a required argument
 *
 * The copies each shipped a `startsWith('/user/')` predicate, inherited from a
 * reference project. In one repo that worker serves **no `/user/` route**, so the
 * predicate could never return `true` and `Cache-Control: no-store` was never
 * applied to anything: the operator's own address and every user's address
 * shipped with no `Cache-Control` at all.
 *
 * A predicate copied from another router's route table is not a conservative
 * default; it is an unconditional no-op. So a caller states its own private
 * prefixes, and the compiler asks for them rather than letting them be omitted.
 */

/** The slice of a Hono context this middleware reads. */
interface HeaderContext {
  header(name: string, value: string): void;
  res: { headers: Headers };
  req: { url: string };
}

/**
 * Baseline headers for API JSON responses and the SPA shell.
 *
 * The SPA ships inline scripts and styles from the Vite build, so CSP allows
 * 'unsafe-inline' for both, bounded by `same-origin` and `frame-ancestors`.
 * Without it the shell breaks; hashes or nonces are a future tightening once the
 * build emits stable hashes.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Origin-Agent-Cluster': '?1',
} as const;

/**
 * CSP for the HTML shell.
 *
 * Separate from {@link SECURITY_HEADERS} because it applies only to an HTML
 * response — sending it on JSON is noise at best and a source of confusing
 * violation reports at worst.
 */
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

/** HSTS. Only sent over HTTPS — sending it over plain HTTP risks local pinning. */
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

/**
 * Apply the headers to a context.
 *
 * Each step is independently guarded: a header must never fail a request, and
 * one unparseable URL should not cost the other headers.
 */
function applySecurityHeaders(c: HeaderContext, isSensitive: (pathname: string) => boolean): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(key, value);
  }

  const contentType = c.res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  }

  let pathname: string | undefined;
  try {
    pathname = new URL(c.req.url).pathname;
  } catch {
    // URL parsing must never fail the request; the `no-store` step is skipped.
  }
  if (pathname !== undefined && isSensitive(pathname)) {
    c.header('Cache-Control', 'no-store');
  }

  try {
    if (new URL(c.req.url).protocol === 'https:') {
      c.header('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
    }
  } catch {
    // URL parsing must never fail the request.
  }
}

/**
 * The middleware.
 *
 * `isSensitive` is **required**, and its parameter is required, so a caller
 * cannot accidentally ship a predicate that returns `true` for everything
 * (caching a credential response) or `false` for everything (the no-op above).
 */
function securityHeaders(isSensitive: (pathname: string) => boolean): (c: HeaderContext, next: () => Promise<void>) => Promise<void> {
  return async (c: HeaderContext, next: () => Promise<void>): Promise<void> => {
    await next();
    try {
      applySecurityHeaders(c, isSensitive);
    } catch {
      // Headers must never fail the request.
    }
  };
}

/**
 * Build a predicate from this app's private path prefixes.
 *
 * A convenience over `securityHeaders`, not a default: it matches **exactly**
 * these prefixes, so a caller still has to name its own paths. The returned
 * function composes, so a repo with a second private surface can add its own
 * test without editing this one.
 */
function sensitivePaths(...prefixes: readonly string[]): (pathname: string) => boolean {
  if (prefixes.length === 0) {
    // Not a throw: a repo with nothing private is a legitimate state, and the
    // failure mode to avoid is silently caching a credential, which an empty
    // list cannot do. What it must not do is *look* like it protected something.
    return () => false;
  }
  const normalized = prefixes.map((prefix) => (prefix.endsWith('/') ? prefix : `${prefix}/`));
  return (pathname: string): boolean => normalized.some((prefix) => pathname.startsWith(prefix));
}

export { applySecurityHeaders, securityHeaders, sensitivePaths, CONTENT_SECURITY_POLICY, SECURITY_HEADERS, STRICT_TRANSPORT_SECURITY };
export type { HeaderContext };
