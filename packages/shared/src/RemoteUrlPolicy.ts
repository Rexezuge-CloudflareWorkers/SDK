/**
 * Egress policy and SSRF host predicates for user-supplied URLs.
 *
 * ## Provenance
 *
 * Merged from Durable-DAV's `packages/shared/src/net/RemoteUrlPolicy.ts` and the
 * `SsrfHosts.ts` of Durable-DAV-Router, Edge-Git and Edge-Sonic. The two were the
 * same problem solved twice: Durable-DAV's `RemoteUrlPolicy` is the full
 * validate-and-canonicalize policy (HTTPS-only, public-address-only, operator
 * allow-list, redirect re-validation); the Router/Edge-Git/Edge-Sonic
 * `SsrfHosts` are the lower-level "is this host private?" predicate the policy in
 * each repo leaned on. Canonical name is **`RemoteUrlPolicy`** (Durable-DAV's);
 * the host predicate it converges onto is exported as **`isPrivateOrInternalHost`**
 * (the common `isSsrfBlockedHost`-style composite from SsrfHosts).
 *
 * Scheduled replication / webhook delivery / git import turns a caller into
 * someone who can name a host this Worker connects to. Without a policy that is
 * server-side request forgery against Cloudflare's own egress: the metadata
 * service, the loopback interface, and anything reachable on a private network the
 * Worker happens to share.
 *
 * ## Design decisions
 *
 * - **The octet-accurate IP checks win over SsrfHosts' naive string prefixes.**
 *   SsrfHosts' `isBlockedIpv6Host` matched `startsWith('fc')`/`'fd')`, which also
 *   matches a *hostname* like `fcb.example.com`; Durable-DAV's `isBlockedIpv6` /
 *   `isBlockedIpv4` parse the address (and decode IPv4-mapped IPv6) instead. The
 *   kit keeps the rigorous form for both the URL policy and the exported
 *   predicate, so there is one correct answer rather than two that drift.
 * - **`isPrivateOrInternalHost` is strictly safer than either source.** It folds
 *   in SsrfHosts' raw-hostname handling (bare-integer/octal/hex/`0x`-dotted forms,
 *   trailing-dot and bracket stripping, localhost names and `.local`/`.internal`/
 *   `.home.arpa` suffixes) that Durable-DAV's URL-path checks could skip because
 *   `new URL` had already canonicalized the host. A public IPv6 literal is allowed
 *   exactly as `normalizeRemoteUrl` allows it; every private/loopback/unique-local/
 *   link-local/zone/mapped form is refused.
 *
 * ## Known gap, stated rather than hidden
 *
 * DNS rebinding is not covered. A host that resolves to a public address at
 * validation time and a private one when the connection is made defeats every
 * check here. Closing it needs a resolution-aware fetch, which the platform does
 * not expose to a Worker. The upheld rule for such a deployment is to pin an
 * origin allow-list.
 */

const MAX_REMOTE_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;

/**
 * Host suffixes that never name a real internet peer.
 */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'] as const;

/**
 * Hostnames that resolve inward by definition.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);

type UrlPolicyOptions = {
  /**
   * Hostnames (exact, or `.suffix` form) permitted regardless of the address
   * rules. Only ever populated from operator configuration, never from the
   * request body.
   */
  allowedHosts?: readonly string[];
};

class RemoteUrlRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteUrlRejectedError';
  }
}

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function ipv4Octets(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/**
 * Is this IPv4 literal in a range a Worker must never reach?
 *
 * `0.0.0.0/8` and `169.254.0.0/16` matter as much as RFC 1918: the first is
 * "this host" on Linux, the second is the cloud metadata endpoint.
 */
function isBlockedIpv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  if ([0, 10, 127].includes(a)) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Decode an IPv4-mapped IPv6 address back into its four octets, or null.
 *
 * Both spellings have to be handled. `new URL` canonicalizes
 * `https://[::ffff:10.0.0.1]/` to the hex form `[::ffff:a00:1]`, so a check
 * written only against the dotted text never fires — and that address connects to
 * a private network.
 */
function mappedIpv4Octets(literal: string): number[] | null {
  const dotted = /^::ffff:\d{1,3}(?:\.\d{1,3}){3}$/.exec(literal);
  const dottedText = literal.slice('::ffff:'.length);
  if (dotted !== null) return ipv4Octets(dottedText);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(literal);
  if (!hex?.[1] || !hex[2]) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return !Number.isFinite(high) || !Number.isFinite(low) ? null : [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
}

/**
 * Is this IPv6 literal private, loopback, or an IPv4 address in disguise? `literal`
 * is the **unbracketed** inner form (e.g. `::1`, `fe80::1`).
 *
 * The last case is the one that matters: `::ffff:127.0.0.1` is a perfectly valid
 * URL and connects to loopback, so the embedded IPv4 must be re-checked rather
 * than the literal waved through because it "is" IPv6.
 */
function isBlockedIpv6(literal: string): boolean {
  const lower = literal.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // Zone ids (`fe80::1%eth0`) name a local interface directly.
  if (lower.includes('%')) return true;
  const mapped = mappedIpv4Octets(lower);
  if (mapped !== null) return isBlockedIpv4(mapped);
  const head = lower.split(':', 1)[0] ?? '';
  if (head === '') return false;
  const group = Number.parseInt(head.padStart(4, '0').slice(0, 4), 16);
  if (!Number.isFinite(group)) return false;
  // fc00::/7 unique-local, fe80::/10 link-local.
  return (group & 0xfe_00) === 0xfc_00 || (group & 0xff_c0) === 0xfe_80;
}

/**
 * Does this host name a numeric address in a non-canonical spelling? The strict
 * superset of Durable-DAV's `looksLikeObfuscatedNumericHost` and SsrfHosts'
 * `isEncodedNumericHost`, for the raw-hostname predicate.
 *
 * `2130706433`, `0177.0.0.1`, `0x7f000001` and `0x7f.1` all name `127.0.0.1`.
 * Through `new URL` these arrive already canonicalized (so `isBlockedIpv4` catches
 * them); a hostname handed to `isPrivateOrInternalHost` need not have gone through
 * `URL`, so a bare integer/octal/hex form is caught here directly. A legitimate
 * internet hostname is never all-digits, so over-blocking is not a risk.
 */
function looksLikeObfuscatedNumericHost(host: string): boolean {
  if (isIpv4Literal(host) || host.startsWith('[') || !/^[0-9a-fx.]+$/i.test(host)) return false;
  return (
    /^0x[0-9a-f]+$/i.test(host) ||
    /^\d+$/.test(host) ||
    /^0[0-7]+(?:\.0[0-7]+)*$/.test(host) ||
    // An all-digits-and-dots host that is not a canonical dotted-quad — e.g.
    // `0177.0.0.1` or `0200.0250.0001.0001` — is an obfuscated numeric address.
    /^[\d.]+$/.test(host) ||
    host.split('.').some((group) => /^0x[0-9a-f]+$/i.test(group))
  );
}

function hostIsAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const lower = host.toLowerCase();
  return allowedHosts.some((entry) => {
    const candidate = entry.trim().toLowerCase();
    if (candidate === '') return false;
    return candidate.startsWith('.') ? lower.endsWith(candidate) : lower === candidate;
  });
}

/**
 * Strip one enclosing `[`…`]` pair (an IPv6 literal's URL brackets).
 */
function stripBrackets(host: string): string {
  const h = host.trim();
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
}

/**
 * Strip a bracketed wrapper and every trailing root-label dot.
 *
 * A fully-qualified name ends in a root label (`example.com.`) and `new URL` keeps
 * it; RFC 4918 §9.1.2 clients vary on sending it, so the canonical form is compared.
 */
function stripTrailingDot(host: string): string {
  const unbracketed = stripBrackets(host);
  let end = unbracketed.length;
  while (end > 0 && unbracketed.charAt(end - 1) === '.') end -= 1;
  return unbracketed.slice(0, end);
}

/**
 * Host names that mean "this machine or a local suffix", not an internet peer.
 */
function isLocalhostName(host: string): boolean {
  return BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * True when a URL host resolves to this machine or a private network.
 *
 * Intended for user-supplied URLs that the server will subsequently fetch. Such a
 * URL turns the process into a proxy into its own network: without this, a
 * user-supplied `baseUrl` can point at cloud metadata, a database host, or a
 * loopback admin port, and the response is readable by the caller.
 *
 * Encoded-numeric hosts are included because `http://2130706433/` and
 * `http://0177.0.0.1/` are ordinary-looking strings that name `127.0.0.1` after
 * parsing.
 *
 * A *strict, safer* predicate: an empty host, any private/loopback/link-local/
 * unique-local/mapped form, any localhost/suffix name, any obfuscated numeric
 * form, and any `:`-bearing host that is not a public IPv6 literal all return
 * true. It is a *syntactic* check — a public hostname can still resolve to a
 * private address (DNS rebinding) — so a hard-guarantee deployment additionally
 * pins an allow-list (see the file header).
 */
function isPrivateOrInternalHost(hostname: string): boolean {
  const host = stripTrailingDot(hostname).toLowerCase();
  if (host.length === 0 || isLocalhostName(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  if (isIpv4Literal(host)) {
    const octets = ipv4Octets(host);
    return octets === null || isBlockedIpv4(octets);
  }
  if (host.includes(':')) return isBlockedIpv6(host);
  return looksLikeObfuscatedNumericHost(host);
}

/**
 * Validate and canonicalise a remote URL.
 *
 * Throws `RemoteUrlRejectedError` with a message meant for the owner: every
 * rejection here is a configuration mistake or an attack, and saying which one
 * is what makes the difference between a fixable setup error and a support
 * ticket. Query and fragment are dropped — a WebDAV base URL has no use for
 * either, and keeping them would let `?a=b` smuggle a second meaning past the
 * path checks the sync engine does.
 */
function normalizeRemoteUrl(raw: unknown, options: UrlPolicyOptions = {}): string {
  if (typeof raw !== 'string') throw new RemoteUrlRejectedError('remoteUrl must be a string');
  const trimmed = raw.trim();
  if (trimmed === '') throw new RemoteUrlRejectedError('remoteUrl is required');
  if (trimmed.length > MAX_REMOTE_URL_LENGTH)
    throw new RemoteUrlRejectedError(`remoteUrl must be at most ${MAX_REMOTE_URL_LENGTH} characters`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RemoteUrlRejectedError('remoteUrl is not a valid absolute URL');
  }

  if (url.protocol !== 'https:') throw new RemoteUrlRejectedError('remoteUrl must use https');
  if (url.username !== '' || url.password !== '')
    throw new RemoteUrlRejectedError('remoteUrl must not embed credentials; use the auth fields instead');
  if (url.port !== '' && url.port !== '443') throw new RemoteUrlRejectedError('remoteUrl must use the default https port');

  const host = url.hostname.toLowerCase();
  if (host === '') throw new RemoteUrlRejectedError('remoteUrl must include a host');
  if (hostIsAllowed(host, options.allowedHosts ?? [])) {
    url.search = '';
    url.hash = '';
    return url.href;
  }

  if (BLOCKED_HOSTNAMES.has(host)) throw new RemoteUrlRejectedError(`remoteUrl host ${host} is not routable`);
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) throw new RemoteUrlRejectedError(`remoteUrl host ${host} is not a public hostname`);
  }
  if (looksLikeObfuscatedNumericHost(host))
    throw new RemoteUrlRejectedError(`remoteUrl host ${host} is a numeric address in a non-canonical form`);

  if (isIpv4Literal(host)) {
    const octets = ipv4Octets(host);
    if (octets === null || isBlockedIpv4(octets)) throw new RemoteUrlRejectedError(`remoteUrl host ${host} is not a public address`);
  } else if (host.startsWith('[')) {
    if (isBlockedIpv6(host.slice(1, -1))) throw new RemoteUrlRejectedError(`remoteUrl host ${host} is not a public address`);
  } else if (!host.includes('.')) {
    // A single-label name can only be resolved through a local search domain.
    throw new RemoteUrlRejectedError(`remoteUrl host ${host} is not a fully qualified hostname`);
  }

  url.search = '';
  url.hash = '';
  return url.href;
}

/**
 * Re-validate the target of a redirect.
 *
 * Called for every hop rather than once at the start. Validating the configured
 * URL and then following `Location` unchecked is a classic TOCTOU: the first
 * hop is public, the second is `169.254.169.254`, and the policy has already
 * returned by then.
 */
function resolveRedirectUrl(baseUrl: string, location: string, options: UrlPolicyOptions = {}): string {
  let next: URL;
  try {
    next = new URL(location, baseUrl);
  } catch {
    throw new RemoteUrlRejectedError('redirect target is not a valid URL');
  }
  if (next.protocol !== 'https:') throw new RemoteUrlRejectedError('redirect target must use https');
  // Same host: no need to re-run the whole policy, and a redirect back to the
  // origin's own host is the overwhelmingly common case.
  if (next.host.toLowerCase() === new URL(baseUrl).host.toLowerCase()) {
    next.search = '';
    next.hash = '';
    return next.href;
  }
  return normalizeRemoteUrl(next.href, options);
}

function parseAllowedHosts(raw: unknown): string[] {
  return typeof raw !== 'string' || raw.trim() === ''
    ? []
    : raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
}

export {
  normalizeRemoteUrl,
  resolveRedirectUrl,
  parseAllowedHosts,
  isPrivateOrInternalHost,
  stripBrackets,
  stripTrailingDot,
  RemoteUrlRejectedError,
  MAX_REMOTE_URL_LENGTH,
  MAX_REDIRECTS,
  BLOCKED_HOST_SUFFIXES,
  BLOCKED_HOSTNAMES,
};
export type { UrlPolicyOptions };
