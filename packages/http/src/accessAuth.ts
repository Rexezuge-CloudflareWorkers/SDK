/**
 * Cloudflare Access authentication for the **user API**.
 *
 * Converged from `AccessAuthService.ts` in AWS-AccessBridge, Durable-DAV,
 * Durable-DAV-Router, Edge-Git and Edge-Sonic. Edge-Sonic's was the one that had
 * fixed the defect the others carried, so this is that one.
 *
 * ## The defect this converges away
 *
 * AWS-AccessBridge's copy read the identity off a cast `executionCtx.access`.
 * `ExecutionContext` has only `waitUntil` and `passThroughOnException` — there is
 * no `access` member — so **the branch could never execute**. It was documented
 * in two AGENTS.md files and covered by six tests, none of which reflected the
 * deployed path. A deployment with no Access in front of it answered 401 through
 * the JWT path and the fallback was dead code that read as a safety net.
 *
 * `getIdentity` lives on a **binding**, and Cloudflare provisions it for a Worker
 * behind an Access application, so it cannot be declared in a wrangler config
 * and `wrangler types` never emits it. The shape is declared here instead, and
 * **its absence is a supported state**: a deployment with no Access answers 401,
 * not an open door.
 *
 * ## The other two fixes
 *
 * - **`Cf-Access-Authenticated-User-Email` is never trusted.** Cloudflare
 *   documents it as a *response* header it sets; read back as a *request* header,
 *   any caller can name themselves.
 * - **An unverified identity inside the trusted binding still does not
 *   authenticate.** Cloudflare has used both `emailVerified` and
 *   `email_verified`; accepting one is a fail-open that only shows in production.
 *
 * Every JWT failure collapses to one message: "signature verification failed"
 * versus "expired" tells an unauthenticated caller which part of the token they
 * got right.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isValidEmailFormat } from '@rexezuge/shared';

/** The identity the `ACCESS` binding reports. */
interface AccessIdentity {
  email?: string | null;
  emailVerified?: boolean | null;
  email_verified?: boolean | null;
}

/**
 * The `ACCESS` binding, as the platform provides it.
 *
 * Never a wrangler declaration — see the file header.
 */
interface AccessBinding {
  getIdentity(): Promise<AccessIdentity | undefined>;
}

/** A JWT verifier, so a test can inject one instead of reaching for `jose`. */
interface AccessJwtVerifier {
  verify(token: string, teamDomain: string, policyAud: string): Promise<string>;
}

interface AccessAuthOptions {
  /**
   * Whether this environment may use the dev/demo bypasses.
   *
   * Deliberately an **allow-list** rather than `environment !== 'production'`:
   * a deny-list would enable the bypass for `staging`, `Preview`, and a
   * misspelled `prodcution`.
   */
  bypassAllowed?: boolean;
  /** The demo user, consulted when `bypassAllowed` and demo mode is on. */
  demoUserEmail?: string | null;
  isDemoMode?: boolean;
  /** The dev identity, consulted after demo mode. */
  devAuthEmail?: string | null;
  teamDomain?: string | null;
  policyAud?: string | null;
  verifier?: AccessJwtVerifier;
}

/** A rejected address. Local rather than an `Error`, so it cannot be caught as one. */
class AccessAuthError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AccessAuthError';
  }
}

/**
 * Bounded LRU of JWKS resolvers, keyed by team domain.
 *
 * Bounded because the map is process-wide and a domain is operator-supplied:
 * without a ceiling, a config that varies the team domain per environment grows
 * one resolver per environment for the isolate's lifetime. Refreshed on read so
 * a rotating domain cannot flush a live one.
 */
const JWKS_CACHE_LIMIT = 10;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function normalizeTeamDomain(teamDomain: string): string {
  return trimTrailingSlashes(teamDomain.trim().toLowerCase());
}

function jwksFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const normalized = normalizeTeamDomain(teamDomain);
  const cached = jwksCache.get(normalized);
  if (cached) {
    jwksCache.delete(normalized);
    jwksCache.set(normalized, cached);
    return cached;
  }
  const created = createRemoteJWKSet(new URL(`${normalized}/cdn-cgi/access/certs`));
  if (jwksCache.size >= JWKS_CACHE_LIMIT) {
    const oldest = jwksCache.keys().next().value;
    if (oldest !== undefined) jwksCache.delete(oldest);
  }
  jwksCache.set(normalized, created);
  return created;
}

/**
 * The `jose` verifier, separated so the JWKS cache and the claim handling can be
 * asserted without a network fetch or a signing key.
 */
const joseVerifier: AccessJwtVerifier = {
  async verify(token: string, teamDomain: string, policyAud: string): Promise<string> {
    const issuer = normalizeTeamDomain(teamDomain);
    const { payload } = await jwtVerify(token, jwksFor(issuer), { issuer, audience: policyAud });
    return typeof payload.email === 'string' ? payload.email : '';
  },
};

/**
 * A plausible address for authentication purposes.
 *
 * Delegates to `@rexezuge/shared`'s canonical validator rather than keeping a
 * fourth regex in the family — the copies that carried their own are how two
 * repos ended up disagreeing about which addresses authenticate at all. The
 * whitespace rejection is separate because an address that reached here with a
 * space in it is a malformed header, not merely an invalid format.
 */
function isValidAuthEmail(raw: string): boolean {
  return !/\s/.test(raw) && isValidEmailFormat(raw);
}

/**
 * Resolve the authenticated address, or throw.
 *
 * The order is deliberate: demo → dev → JWT → binding. The first two are gated
 * on {@link AccessAuthOptions.bypassAllowed} rather than on an environment
 * comparison, so a misspelled environment name cannot enable them.
 */
async function authenticateAccess(request: Request, binding: AccessBinding | undefined, options: AccessAuthOptions): Promise<string> {
  if (options.bypassAllowed) {
    if (options.isDemoMode && options.demoUserEmail) {
      return options.demoUserEmail.trim().toLowerCase();
    }
    const dev = options.devAuthEmail?.trim() ?? '';
    if (dev && isValidAuthEmail(dev)) return dev.toLowerCase();
  }

  const teamDomain = options.teamDomain;
  const policyAud = options.policyAud;

  if (teamDomain && policyAud) {
    try {
      return await verifyAccessJwt(request, teamDomain, policyAud, options.verifier ?? joseVerifier);
    } catch {
      // Fall through to the binding. A request can carry either.
    }
  }

  const fromBinding = await identityFromBinding(binding);
  if (fromBinding !== null) return fromBinding;

  throw new AccessAuthError('Cloudflare Access authentication failed.');
}

/**
 * The `ACCESS` binding path.
 *
 * `undefined` is the platform's "no identity" answer and is handled by the same
 * optional chain as a throw: a rejected `getIdentity` resolves to `undefined` and
 * falls through to the single throw site, so a broken binding is a 401 rather
 * than an unhandled rejection in the auth middleware.
 */
async function identityFromBinding(binding: AccessBinding | undefined): Promise<string | null> {
  const identity = await binding?.getIdentity().catch(() => undefined);
  if (identity?.emailVerified === false || identity?.email_verified === false) return null;
  const email = identity?.email?.trim().toLowerCase() ?? '';
  return isValidAuthEmail(email) ? email : null;
}

/**
 * Verify the `cf-access-jwt-assertion` header.
 *
 * Throws {@link AccessAuthError} for every failure, with one message: a detailed
 * one tells an unauthenticated caller which part of the token they got right.
 */
async function verifyAccessJwt(request: Request, teamDomain: string, policyAud: string, verifier: AccessJwtVerifier): Promise<string> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AccessAuthError('No Cloudflare Access JWT token provided in request headers.');

  const issuer = normalizeTeamDomain(teamDomain);
  const audience = policyAud.trim();
  if (!audience) throw new AccessAuthError('Missing required JWT verification configuration.');
  // A comma-joined value would fail inside the verifier with a message that
  // reads like a bad signature, which sends an operator looking at their key.
  if (audience.includes(',')) {
    throw new AccessAuthError('Multiple JWT audiences are not supported. Configure a single POLICY_AUD value.');
  }

  try {
    const email = (await verifier.verify(token, issuer, audience)).trim().toLowerCase();
    if (!isValidAuthEmail(email)) throw new AccessAuthError('Cloudflare Access authentication failed.');
    return email;
  } catch (error) {
    if (error instanceof AccessAuthError) throw error;
    throw new AccessAuthError('Cloudflare Access authentication failed.');
  }
}

export { AccessAuthError, authenticateAccess, identityFromBinding, verifyAccessJwt };
export type { AccessAuthOptions, AccessBinding, AccessIdentity, AccessJwtVerifier };
