import { describe, expect, it } from 'vitest';
import { isValidEmailFormat, MAX_EMAIL_LENGTH } from './Identity';
import { normalizeEmail } from './EmailUtil';

describe('isValidEmailFormat', () => {
  it('accepts well-formed addresses', () => {
    for (const raw of ['a@example.com', 'alice+tag@sub.example.co', ' UPPER@Example.COM ', 'x@y.io']) {
      expect(isValidEmailFormat(raw), raw).toBe(true);
    }
  });

  it('rejects the obvious mistakes', () => {
    for (const bad of ['', 'no-at-sign', 'a@b', 'a@b.c@d.com', 'a b@example.com', 'a@.b.com', 'a@b..com', 'a@@b.com']) {
      expect(isValidEmailFormat(bad), bad).toBe(false);
    }
  });

  it('keeps the stricter regex: a leading-dot domain is refused', () => {
    // Durable-DAV's `[^\s@.]+(?:\.[^\s@.]+)+` rejects `a@.b.c`; the looser
    // Router/Sonic regex would admit it. The kit kept the stricter form.
    expect(isValidEmailFormat('a@.b.c')).toBe(false);
  });

  it('bounds the total length', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH);
    expect(isValidEmailFormat(`${local}@example.com`)).toBe(false);
    expect(MAX_EMAIL_LENGTH).toBe(254);
  });

  it('permits exactly one @', () => {
    expect(isValidEmailFormat('a@b@example.com')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases to a stable account key', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });
});
