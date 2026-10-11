import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@rexezuge/errors';
import { BaseRoute, createRouteHandler } from './routeBase';
import type { RouteContext } from './routeBase';

function context(body: unknown = {}): RouteContext & { body: unknown } {
  const variables = new Map<string, unknown>();
  return {
    body,
    req: {
      json: async () => body,
      raw: new Request('https://example.com/user/me'),
    },
    env: { DB: 'test' },
    get: (key: string) => variables.get(key),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
}

describe('BaseRoute.readJson', () => {
  it('reads a JSON body', async () => {
    expect(await BaseRoute.readJson(context({ id: 7 }))).toEqual({ id: 7 });
  });

  it('yields {} for a malformed body rather than throwing', async () => {
    // A parse error thrown from here would bypass the repo's own validation
    // message; a handler that wants to reject a malformed body validates it.
    const broken = context();
    broken.req.json = async () => {
      throw new SyntaxError('Unexpected token');
    };
    expect(await BaseRoute.readJson(broken)).toEqual({});
  });
});

describe('BaseRoute.requireString', () => {
  it('returns a non-empty string', () => {
    expect(BaseRoute.requireString('value', 'name')).toBe('value');
  });

  it('names the missing field in the error', () => {
    expect(() => BaseRoute.requireString('', 'name')).toThrow(/`name`/);
    expect(() => BaseRoute.requireString(undefined, 'owner')).toThrow(/`owner`/);
    expect(() => BaseRoute.requireString(42, 'owner')).toThrow(/`owner`/);
  });

  it('is a 400, not a 500', () => {
    expect(() => BaseRoute.requireString(undefined, 'name')).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('createRouteHandler', () => {
  it('returns the handler response on success', async () => {
    const handler = createRouteHandler(async () => new Response('ok', { status: 201 }));
    expect((await handler(context())).status).toBe(201);
  });

  it('maps a thrown ServiceError through the canonical dialect', async () => {
    const handler = createRouteHandler(async () => {
      throw new NotFoundError();
    });
    const response = await handler(context());
    expect(response.status).toBe(404);
  });

  it('masks a thrown 5xx', async () => {
    const handler = createRouteHandler(async () => {
      throw new Error('connection to 10.0.0.4 refused');
    });
    const body = (await (await handler(context())).json()) as { Exception: { Message: string } };
    expect(body.Exception.Message).not.toContain('10.0.0.4');
  });

  it('defers to a repo-supplied mapper when given one', async () => {
    const handler = createRouteHandler(
      async () => {
        throw new NotFoundError();
      },
      { onError: () => new Response('code=70', { status: 200 }) },
    );
    expect((await handler(context())).status).toBe(200);
  });
});
