import { describe, expect, it } from 'vitest';
import { AccessAuthError, authenticateAccess, verifyAccessJwt } from './accessAuth';
import type { AccessBinding, AccessJwtVerifier } from './accessAuth';

const request = (headers: Record<string, string> = {}): Request => new Request('https://example.com/user/me', { headers });

/** A verifier that stands in for `jose` so the suite needs no key or network. */
function verifierReturning(email: string): AccessJwtVerifier {
  return { verify: async () => email };
}

describe('verifyAccessJwt', () => {
  it('returns the address when the token verifies', async () => {
    const email = await verifyAccessJwt(
      request({ 'cf-access-jwt-assertion': 'token' }),
      'team.example.com',
      'AUD',
      verifierReturning('Ops@Example.com'),
    );
    expect(email).toBe('ops@example.com');
  });

  it('collapses every failure to one message', async () => {
    // "signature verification failed" versus "expired" tells an unauthenticated
    // caller which part of the token they got right.
    const failing: AccessJwtVerifier = {
      verify: async () => {
        throw new Error('JWT signature verification failed');
      },
    };
    await expect(verifyAccessJwt(request({ 'cf-access-jwt-assertion': 'token' }), 'team.example.com', 'AUD', failing)).rejects.toThrow(
      'Cloudflare Access authentication failed.',
    );
  });

  it('refuses a token with no address claim', async () => {
    await expect(
      verifyAccessJwt(request({ 'cf-access-jwt-assertion': 'token' }), 'team.example.com', 'AUD', verifierReturning('')),
    ).rejects.toThrow(AccessAuthError);
  });

  it('rejects a comma-joined audience rather than letting it read as a bad signature', async () => {
    await expect(
      verifyAccessJwt(request({ 'cf-access-jwt-assertion': 'token' }), 'team.example.com', 'AUD1,AUD2', verifierReturning('a@b.com')),
    ).rejects.toThrow(/Multiple JWT audiences/);
  });

  it('requires a token', async () => {
    await expect(verifyAccessJwt(request(), 'team.example.com', 'AUD', verifierReturning('a@b.com'))).rejects.toThrow(
      /No Cloudflare Access/,
    );
  });

  it('normalizes a trailing slash on the team domain before verifying', async () => {
    const seen: string[] = [];
    const recording: AccessJwtVerifier = {
      verify: async (_token, teamDomain) => {
        seen.push(teamDomain);
        return 'ops@example.com';
      },
    };
    await verifyAccessJwt(request({ 'cf-access-jwt-assertion': 'token' }), 'Team.Example.com/', 'AUD', recording);
    expect(seen[0]).toBe('team.example.com');
  });
});

describe('authenticateAccess', () => {
  it('reads the identity off the ACCESS binding', async () => {
    const binding: AccessBinding = { getIdentity: async () => ({ email: 'Ops@Example.com', emailVerified: true }) };
    expect(await authenticateAccess(request(), binding, {})).toBe('ops@example.com');
  });

  it('refuses an unverified identity in either spelling', async () => {
    // Cloudflare has used both; accepting one is a fail-open that only shows up
    // in production.
    const camel: AccessBinding = { getIdentity: async () => ({ email: 'ops@example.com', emailVerified: false }) };
    const snake: AccessBinding = { getIdentity: async () => ({ email: 'ops@example.com', email_verified: false }) };
    await expect(authenticateAccess(request(), camel, {})).rejects.toThrow(AccessAuthError);
    await expect(authenticateAccess(request(), snake, {})).rejects.toThrow(AccessAuthError);
  });

  it('treats a missing binding as 401, not as an open door', async () => {
    await expect(authenticateAccess(request(), undefined, {})).rejects.toThrow(AccessAuthError);
  });

  it('treats undefined — the platform "no identity" answer — as absent', async () => {
    const binding: AccessBinding = { getIdentity: async () => undefined };
    await expect(authenticateAccess(request(), binding, {})).rejects.toThrow(AccessAuthError);
  });

  it('turns a rejected binding into a 401 rather than an unhandled rejection', async () => {
    const binding: AccessBinding = {
      getIdentity: async () => {
        throw new Error('binding is broken');
      },
    };
    await expect(authenticateAccess(request(), binding, {})).rejects.toThrow(AccessAuthError);
  });

  it('ignores the spoofable Cf-Access-Authenticated-User-Email request header', async () => {
    // Cloudflare documents this as a *response* header it sets. Read back as a
    // request header, any caller can name themselves.
    const forged = request({ 'Cf-Access-Authenticated-User-Email': 'admin@example.com' });
    await expect(authenticateAccess(forged, undefined, {})).rejects.toThrow(AccessAuthError);
  });

  it('accepts the bypasses only when the environment allows them', async () => {
    await expect(
      authenticateAccess(request(), undefined, { bypassAllowed: false, demoUserEmail: 'demo@example.com', isDemoMode: true }),
    ).rejects.toThrow(AccessAuthError);

    expect(
      await authenticateAccess(request(), undefined, { bypassAllowed: true, demoUserEmail: 'Demo@Example.com', isDemoMode: true }),
    ).toBe('demo@example.com');
  });

  it('prefers demo mode, then the dev identity', async () => {
    const options = { bypassAllowed: true, demoUserEmail: 'demo@example.com', isDemoMode: true, devAuthEmail: 'dev@example.com' };
    expect(await authenticateAccess(request(), undefined, options)).toBe('demo@example.com');
    expect(await authenticateAccess(request(), undefined, { ...options, isDemoMode: false })).toBe('dev@example.com');
  });

  it('ignores a malformed dev identity rather than authenticating it', async () => {
    await expect(authenticateAccess(request(), undefined, { bypassAllowed: true, devAuthEmail: 'not-an-email' })).rejects.toThrow(
      AccessAuthError,
    );
  });

  it('falls back to the binding when no JWT config is present', async () => {
    const binding: AccessBinding = { getIdentity: async () => ({ email: 'ops@example.com', emailVerified: true }) };
    expect(await authenticateAccess(request(), binding, { teamDomain: null, policyAud: null })).toBe('ops@example.com');
  });
});
