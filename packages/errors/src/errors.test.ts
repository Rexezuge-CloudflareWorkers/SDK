import { describe, expect, it } from 'vitest';
import { CATALOG } from './CATALOG';
import { BadRequestError } from './BadRequestError';
import { ConflictError } from './ConflictError';
import { DatabaseError } from './DatabaseError';
import { InternalServerError } from './InternalServerError';
import { NotFoundError } from './NotFoundError';
import { RetryableError } from './OutcomeError';
import { ServiceError } from './ServiceError';
import { UnauthorizedError } from './UnauthorizedError';

describe('CATALOG', () => {
  it('assigns each key a unique status and code', () => {
    const statuses = Object.values(CATALOG).map((definition) => definition.status);
    const codes = Object.values(CATALOG).map((definition) => definition.code);
    expect(new Set(statuses).size).toBe(statuses.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('exposes every 4xx message', () => {
    const fourXx = Object.values(CATALOG).filter((definition) => definition.status < 500);
    expect(fourXx.length).toBeGreaterThan(0);
    for (const definition of fourXx) {
      expect(definition.expose).toBe(true);
    }
  });

  it('keeps operator-facing 5xx faults opaque, with the one public-by-design exception', () => {
    // 503 is the single 5xx whose default message exists for clients
    // ("retry after a delay"); every other 5xx message describes an internal
    // fault and must be substituted at the boundary.
    const publicByDesign = new Set(['SERVICE_UNAVAILABLE']);
    for (const definition of Object.values(CATALOG)) {
      if (definition.status >= 500) {
        expect(definition.expose).toBe(publicByDesign.has(definition.code));
      }
    }
  });
});

describe('per-status errors', () => {
  it('derives status, type, and default message from the catalog', () => {
    const error = new NotFoundError();
    expect(error.status).toBe(404);
    expect(error.type).toBe('notFound');
    expect(error.message).toBe(CATALOG.notFound.defaultMessage);
    expect(error.expose).toBe(true);
  });

  it('accepts a caller-supplied message', () => {
    const error = new NotFoundError('no such volume');
    expect(error.message).toBe('no such volume');
  });

  it('keeps the instanceof chain intact for boundary checks', () => {
    expect(new NotFoundError()).toBeInstanceOf(ServiceError);
    expect(new NotFoundError()).toBeInstanceOf(Error);
    expect(new UnauthorizedError()).not.toBeInstanceOf(NotFoundError);
  });

  it('names itself by the concrete class', () => {
    expect(new ConflictError().name).toBe('ConflictError');
  });
});

describe('ServiceError.toErrorResponse', () => {
  it('emits the envelope for a client-safe error', () => {
    const payload = new BadRequestError('bad input').toErrorResponse();
    expect(payload.status).toBe(400);
    expect(payload.body.Exception).toStrictEqual({ Type: 'badRequest', Message: 'bad input' });
  });

  it('substitutes a generic message for non-exposing errors', () => {
    const payload = new InternalServerError('atob() failed: secret=xyz').toErrorResponse();
    expect(payload.status).toBe(500);
    expect(payload.body.Exception?.Message).not.toContain('secret');
  });
});

describe('DatabaseError', () => {
  it('carries the DAO retry verdict and reports its own type', () => {
    const retryable = new DatabaseError('D1 busy', true);
    const permanent = new DatabaseError('constraint failed', false);
    expect(retryable.retryable).toBe(true);
    expect(permanent.retryable).toBe(false);
    expect(retryable.type).toBe('DatabaseError');
    expect(retryable.status).toBe(500);
  });

  it('preserves the cause chain', () => {
    const cause = new Error('D1_ERROR: database is locked');
    expect(new DatabaseError('write failed', true, { cause }).cause).toBe(cause);
  });
});

describe('OutcomeError taxonomy', () => {
  it('defaults retryable to 502 and non-retryable to 400', () => {
    expect(new RetryableError('throttled').status).toBe(502);
    expect(new RetryableError('throttled').retryable).toBe(true);
    expect(new RetryableError('throttled').type).toBe('RetryableError');
  });

  it('honors an explicit status override', () => {
    expect(new RetryableError('throttled', 503).status).toBe(503);
  });
});

describe('ServiceError.from', () => {
  it('passes a taxonomy error through untouched', () => {
    const original = new NotFoundError('nope');
    expect(ServiceError.from(original)).toBe(original);
  });

  it('wraps a foreign error as a non-retryable 500 with the cause intact', () => {
    const cause = new Error('socket hang up');
    const wrapped = ServiceError.from(cause);
    expect(wrapped).toBeInstanceOf(ServiceError);
    expect(wrapped.status).toBe(500);
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).toBe('socket hang up');
    expect(wrapped.cause).toBe(cause);
  });

  it('wraps a non-Error throwable', () => {
    const wrapped = ServiceError.from('boom');
    expect(wrapped.status).toBe(500);
    expect(wrapped.message).toBe('boom');
  });
});
