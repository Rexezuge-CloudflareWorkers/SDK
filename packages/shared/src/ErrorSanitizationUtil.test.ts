import { describe, expect, it } from 'vitest';
import { ErrorSanitizationUtil } from './ErrorSanitizationUtil.ts';

describe('ErrorSanitizationUtil.sanitizeMessage', () => {
  it('redacts an Authorization header scheme', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('Authorization: Bearer abc123def')).toBe('Authorization: Bearer [REDACTED]');
    expect(ErrorSanitizationUtil.sanitizeMessage('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe('Authorization: Basic [REDACTED]');
  });

  it('keeps the word boundary: nothing leaks from a scheme token', () => {
    // The Mail-Otter lesson: `\bearer` without the closing boundary matched the
    // literal `earer` and leaked. This asserts the token itself is gone.
    const out = ErrorSanitizationUtil.sanitizeMessage('got bearer eyJhbGciOi.error-in-token now');
    expect(out).not.toContain('eyJhbGciOi.error-in-token');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const out = ErrorSanitizationUtil.sanitizeMessage(`header ${jwt} tail`);
    expect(out).toContain('[REDACTED-JWT]');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts Google OAuth access tokens', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('access token ya29.a0AfH6SMBxAbCdEfGhIjKlMnOpQrStUv');
    expect(out).not.toContain('ya29.a0AfH6SMBxAbCdEfGhIjKlMnOpQrStUv');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts key=value secrets and query-string tokens', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('client_secret: hunter2')).toBe('client_secret: [REDACTED]');
    const cb = ErrorSanitizationUtil.sanitizeMessage('redirect?code=secret123&state=1');
    expect(cb).not.toContain('secret123');
    expect(cb).toContain('code=');
  });

  it('redacts a generic personal-access token scheme regardless of the repo prefix', () => {
    // The four repos each hardcoded their own `<repo>-pat:` literal; the kit
    // generalizes it. Any prefix must be caught.
    for (const pat of ['edge-git-pat:abc123', 'durable-dav-pat:XYZ-789', 'edge-sonic-pat:tok']) {
      const out = ErrorSanitizationUtil.sanitizeMessage(`using ${pat} now`);
      expect(out).toContain('[REDACTED-PAT]');
    }
    expect(ErrorSanitizationUtil.sanitizeMessage('using edge-git-pat:abc123 now')).not.toContain('edge-git-pat:abc123');
  });

  it('passes innocuous text through unchanged', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('a plain error about QUOTA_EXCEEDED')).toBe('a plain error about QUOTA_EXCEEDED');
  });
});

describe('ErrorSanitizationUtil.sanitizeErrorForLogging / stackForLog', () => {
  it('redacts the message of an Error, not only a raw string', () => {
    const out = ErrorSanitizationUtil.sanitizeErrorForLogging(new Error('failed with Bearer topsecrettoken'));
    expect(out.startsWith('Error: ')).toBe(true);
    expect(out).not.toContain('topsecrettoken');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts a thrown non-Error value too', () => {
    const out = ErrorSanitizationUtil.sanitizeErrorForLogging('boom ya29.leakygoogetoken');
    expect(out).not.toContain('ya29.leakygoogetoken');
  });

  it('stackForLog runs the whole error (message and stack) through redaction', () => {
    const payload = ErrorSanitizationUtil.stackForLog(new Error('plain'));
    expect(typeof payload).toBe('string');
    const withSecret = ErrorSanitizationUtil.stackForLog(new Error('Bearer sekret-in-message'));
    expect(String(withSecret)).not.toContain('sekret-in-message');
  });
});
