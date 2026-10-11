import { describe, expect, it } from 'vitest';
import { isMissingSchemaError } from './isMissingSchemaError';

describe('isMissingSchemaError', () => {
  it('matches a missing table/column/index in an Error', () => {
    expect(isMissingSchemaError(new Error('D1_ERROR: no such table: user_emails'))).toBe(true);
    expect(isMissingSchemaError(new Error('no such column: id'))).toBe(true);
  });

  it('accepts a thrown string', () => {
    expect(isMissingSchemaError('no such index: idx')).toBe(true);
  });

  it('is false for every other failure shape', () => {
    expect(isMissingSchemaError(new Error('database is locked'))).toBe(false);
    expect(isMissingSchemaError(42)).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
    expect(isMissingSchemaError(undefined)).toBe(false);
  });
});
