import { describe, expect, it } from 'vitest';
import { generateCodeVerifier, generateState, getCodeChallenge, getStateHash } from './OAuth2Pkce.ts';

describe('generateState', () => {
  it('is base64url and long enough not to be guessable', () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes, unpadded base64url.
    expect(state).toHaveLength(43);
  });

  it('does not repeat', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('generateCodeVerifier', () => {
  it('stays inside the RFC 7636 length range', () => {
    // 43–128 characters; 64 random bytes base64url-encodes to 86.
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('getStateHash', () => {
  it('is a stable sha256 hex digest', async () => {
    const first = await getStateHash('abc');
    expect(first).toBe(await getStateHash('abc'));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes different states', async () => {
    expect(await getStateHash('abc')).not.toBe(await getStateHash('abd'));
  });
});

describe('getCodeChallenge', () => {
  it('is the S256 challenge, not the verifier itself', async () => {
    // `plain` would send the verifier verbatim, which defeats PKCE for anyone
    // who can read the authorization request.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await getCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(challenge).not.toBe(verifier);
  });

  it('is base64url with no padding', async () => {
    expect(await getCodeChallenge('a-verifier')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is stable for the same verifier', async () => {
    expect(await getCodeChallenge('same')).toBe(await getCodeChallenge('same'));
  });
});
