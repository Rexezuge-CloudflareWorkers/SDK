import { describe, expect, it } from 'vitest';
import { DatabaseError, NotFoundError, RateLimitedError, ServiceError } from '@rexezuge/errors';
import { errorBody, toErrorResponse, toServiceError } from './ErrorMapper.ts';

const json = (body: unknown, status: number, headers?: Record<string, string>): Response => Response.json(body, { status, headers });

describe('toServiceError', () => {
  it('passes a ServiceError through untouched', () => {
    // Re-wrapping would bury its context.
    const original = new NotFoundError();
    expect(toServiceError(original)).toBe(original);
  });

  it('normalizes anything else into the taxonomy', () => {
    expect(toServiceError(new Error('boom'))).toBeInstanceOf(ServiceError);
    expect(toServiceError('a string')).toBeInstanceOf(ServiceError);
  });
});

describe('errorBody', () => {
  it('keeps a 4xx message', () => {
    const body = errorBody(new NotFoundError('No such volume.'));
    expect(body.Exception.Type).toBe('NotFound');
    expect(body.Exception.Message).toBe('No such volume.');
  });

  it('masks a 5xx message — a D1 error names tables and columns', () => {
    const body = errorBody(new DatabaseError('no such table: credential_chain'));
    expect(body.Exception.Message).not.toContain('credential_chain');
    expect(body.Exception.Message).toMatch(/internal error/i);
  });
});

describe('toErrorResponse', () => {
  it('answers in the family envelope with the catalog status', () => {
    const response = toErrorResponse(new NotFoundError(), json);
    expect(response.status).toBe(404);
  });

  it('answers 500 for an unknown thrown value', () => {
    expect(toErrorResponse(new Error('boom'), json).status).toBe(500);
  });

  it('preserves a 429 rather than flattening it to 500', () => {
    // A client that is told "slow down" but reads a 500 retries immediately.
    expect(toErrorResponse(new RateLimitedError(), json).status).toBe(429);
  });

  it('attaches headers the caller declared for the status', () => {
    const response = toErrorResponse(new RateLimitedError(), json, {
      headers: (status): Record<string, string> => (status === 429 ? { 'Retry-After': '30' } : {}),
    });
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('defers to a surface-specific dialect when one is supplied', () => {
    // One surface, one dialect: a client parsing that surface cannot read the
    // canonical envelope.
    const response = toErrorResponse(new NotFoundError(), json, { toResponse: () => new Response('code=70', { status: 200 }) });
    expect(response.status).toBe(200);
  });

  it('falls through when the surface declines to handle the error', () => {
    const response = toErrorResponse(new NotFoundError(), json, { toResponse: () => {} });
    expect(response.status).toBe(404);
  });
});
