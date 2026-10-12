import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOUDFLARE_MOCKS, DEFAULT_WORKSPACE_PACKAGES, KIT_NO_EXTERNAL, workspaceAliases } from './vitest-aliases.ts';

const ROOT = new URL('.', import.meta.url).href;

function finds(aliases: ReturnType<typeof workspaceAliases>): string[] {
  return aliases.map((alias) => String(alias.find));
}

describe('workspaceAliases', () => {
  it('generates one alias per workspace package under the caller scope', () => {
    const aliases = workspaceAliases({ scope: '@fixture', root: ROOT });
    for (const name of ['shared', 'backend-data', 'backend-services', 'provider-clients', 'webdav', 'background']) {
      expect(finds(aliases)).toContain(`@fixture/${name}`);
    }
    // Another repo's scope never leaks in.
    expect(finds(aliases).some((find) => find.startsWith('@durable-dav/'))).toBe(false);
  });

  it('resolves background under apps/ and packages under packages/', () => {
    const aliases = workspaceAliases({ scope: '@fixture', root: ROOT });
    const byFind = new Map(aliases.map((alias) => [String(alias.find), alias.replacement]));
    expect(byFind.get('@fixture/background')).toContain('apps/background/src');
    expect(byFind.get('@fixture/shared')).toContain('packages/shared/src');
  });

  it('aliases the cloudflare runtime mocks plus the @/ and ~/ prefixes', () => {
    const aliases = workspaceAliases({ scope: '@fixture', root: ROOT });
    expect(finds(aliases)).toContain('cloudflare:workers');
    expect(aliases.some((alias) => alias.find instanceof RegExp && alias.find.source === String.raw`^@\/`)).toBe(true);
    expect(aliases.some((alias) => alias.find instanceof RegExp && alias.find.source === String.raw`^~\/`)).toBe(true);
  });

  it('lets a repo narrow the package and mock sets', () => {
    const aliases = workspaceAliases({ scope: '@fixture', root: ROOT, packages: ['shared'], mocks: ['workers'] });
    expect(finds(aliases)).toContain('@fixture/shared');
    expect(finds(aliases)).not.toContain('@fixture/webdav');
    expect(finds(aliases)).toContain('cloudflare:workers');
    expect(finds(aliases)).not.toContain('cloudflare:sockets');
  });

  it('defaults to the family superset of packages and mocks', () => {
    expect(DEFAULT_WORKSPACE_PACKAGES).toContain('provider-clients');
    expect(DEFAULT_WORKSPACE_PACKAGES).toContain('webdav');
    expect(DEFAULT_WORKSPACE_PACKAGES).toContain('git-protocol');
    expect(DEFAULT_CLOUDFLARE_MOCKS).toEqual(['workers', 'sockets', 'workflows']);
  });

  it('keeps the kit inside Vite via KIT_NO_EXTERNAL', () => {
    expect(KIT_NO_EXTERNAL.some((pattern) => pattern.test('@rexezuge/d1'))).toBe(true);
    expect(KIT_NO_EXTERNAL.some((pattern) => pattern.test('vitest'))).toBe(false);
  });
});
