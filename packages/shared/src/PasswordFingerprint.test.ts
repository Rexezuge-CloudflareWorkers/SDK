import { describe, expect, it } from 'vitest';
import { passwordFingerprint } from './PasswordFingerprint';
import { TokenHashUtil } from './TokenHashUtil';
import { CryptoUtil } from './CryptoUtil';

describe('passwordFingerprint', () => {
  it('is a deterministic unsalted SHA-256 of the password', async () => {
    await expect(passwordFingerprint('correct horse battery staple')).resolves.toBe(
      await CryptoUtil.sha256Hex('correct horse battery staple'),
    );
  });

  it('differs per password (so a memo keyed on it cannot accept a different one)', async () => {
    const a = await passwordFingerprint('hunter2');
    const b = await passwordFingerprint('hunter3');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('TokenHashUtil', () => {
  it('hashes a token to a 64-char hex digest, matching the well-known empty value', async () => {
    await expect(TokenHashUtil.sha256Hex('')).resolves.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('delegates to CryptoUtil.sha256Hex so the two cannot drift', async () => {
    await expect(TokenHashUtil.sha256Hex('a-244-bit-token')).resolves.toBe(await CryptoUtil.sha256Hex('a-244-bit-token'));
  });

  it('is deterministic (the same token always indexes the same row)', async () => {
    await expect(TokenHashUtil.sha256Hex('tok')).resolves.toBe(await TokenHashUtil.sha256Hex('tok'));
  });
});
