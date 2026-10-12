import { describe, expect, it } from 'vitest';
import { defineUnitVitestConfig } from './vitest.ts';
import { defineWebVitestConfig } from './vitest-web.ts';
import { defineRepoVitestConfig } from './vitest-repo.ts';
import { defineIntegrationVitestConfig } from './vitest-integration.ts';

const ROOT = new URL('.', import.meta.url).href;

function aliasesOf(config: unknown): Array<{ find: unknown; replacement: string }> {
  const resolve = (config as { resolve?: { alias?: Array<{ find: unknown; replacement: string }> } }).resolve;
  return resolve?.alias ?? [];
}

function testOf(config: unknown): Record<string, unknown> {
  return (config as { test?: Record<string, unknown> }).test ?? {};
}

describe('defineUnitVitestConfig', () => {
  it('generates the workspace table from scope', () => {
    const aliases = aliasesOf(defineUnitVitestConfig({ scope: '@fixture', root: ROOT }));
    const finds = aliases.map((alias) => String(alias.find));
    expect(finds).toContain('@fixture/backend-services');
    expect(finds).toContain('@fixture/provider-clients');
    expect(finds).toContain('cloudflare:workers');
  });

  it('keeps @rexezuge/* inside Vite by default and merges consumer patterns', () => {
    const config = defineUnitVitestConfig({ scope: '@fixture', root: ROOT, noExternal: [/custom-pkg/] });
    const noExternal = (config as { resolve?: { noExternal?: unknown[] } }).resolve?.noExternal ?? [];
    expect(noExternal.some((pattern) => pattern instanceof RegExp && pattern.test('@rexezuge/d1'))).toBe(true);
    expect(noExternal.some((pattern) => pattern instanceof RegExp && pattern.test('custom-pkg'))).toBe(true);
  });

  it('excludes every SPA shape the family uses', () => {
    const exclude = (testOf(defineUnitVitestConfig({ root: ROOT }))['exclude'] as string[]) ?? [];
    expect(exclude).toContain('test/web/**');
    expect(exclude).toContain('test/**/web-*.test.{ts,tsx}');
    expect(exclude).toContain('apps/web/**/*.test.{ts,tsx}');
  });

  it('accepts include/setupFiles/serverDepsInline overrides', () => {
    const test = testOf(
      defineUnitVitestConfig({ root: ROOT, include: ['test/a/**/*.test.ts'], setupFiles: ['test/setup.ts'], serverDepsInline: [] }),
    );
    expect(test['include']).toEqual(['test/a/**/*.test.ts']);
    expect(test['setupFiles']).toEqual(['test/setup.ts']);
    expect(test['server']).toEqual({ deps: { inline: [] } });
  });
});

describe('defineWebVitestConfig', () => {
  it('maps @/ and ~/ to the SPA source, not the API worker', () => {
    const aliases = aliasesOf(defineWebVitestConfig({ scope: '@fixture', root: ROOT }));
    const at = aliases.find((alias) => alias.find instanceof RegExp && alias.find.source === String.raw`^@\/`);
    const tilde = aliases.find((alias) => alias.find instanceof RegExp && alias.find.source === String.raw`^~\/`);
    expect(at?.replacement).toContain('apps/web/src');
    expect(tilde?.replacement).toContain('apps/web/src');
    // The workspace scope table still resolves beside them.
    expect(aliases.map((alias) => String(alias.find))).toContain('@fixture/shared');
  });

  it('defaults to jsdom and accepts happy-dom', () => {
    expect(testOf(defineWebVitestConfig({ root: ROOT }))['environment']).toBe('jsdom');
    expect(testOf(defineWebVitestConfig({ root: ROOT, environment: 'happy-dom' }))['environment']).toBe('happy-dom');
  });

  it('collects every SPA shape the family uses', () => {
    const include = (testOf(defineWebVitestConfig({ root: ROOT }))['include'] as string[]) ?? [];
    expect(include).toContain('test/web/**/*.test.{ts,tsx}');
    expect(include).toContain('test/**/web-*.test.{ts,tsx}');
    expect(include).toContain('apps/web/**/*.test.{ts,tsx}');
  });
});

describe('defineRepoVitestConfig', () => {
  it('composes backend/node and web/DOM projects with per-project aliases', () => {
    const projects =
      (testOf(defineRepoVitestConfig({ scope: '@fixture', root: ROOT }))['projects'] as Array<Record<string, unknown>>) ?? [];
    expect(projects).toHaveLength(2);
    const backend = projects[0]?.['test'] as Record<string, unknown>;
    const web = projects[1]?.['test'] as Record<string, unknown>;
    expect(backend?.['name']).toBe('backend');
    expect(backend?.['environment']).toBe('node');
    expect(web?.['name']).toBe('web');
    expect(web?.['environment']).toBe('jsdom');
    // Projects do not inherit the root resolve, so each repeats the table.
    for (const project of projects) {
      const finds = ((project as { resolve?: { alias?: Array<{ find: unknown }> } }).resolve?.alias ?? []).map((alias) =>
        String(alias.find),
      );
      expect(finds).toContain('@fixture/shared');
    }
    // And the web project's @/ is the SPA, not the API worker.
    const webAt = ((projects[1] as { resolve?: { alias?: Array<{ find: unknown; replacement: string }> } }).resolve?.alias ?? []).find(
      (alias) => alias.find instanceof RegExp && alias.find.source === String.raw`^@\/`,
    );
    expect(webAt?.replacement).toContain('apps/web/src');
  });

  it('passes the DOM choice and coverage floor through', () => {
    const config = defineRepoVitestConfig({
      scope: '@fixture',
      root: ROOT,
      web: { environment: 'happy-dom' },
      thresholds: { statements: 87 },
    });
    const projects = (testOf(config)['projects'] as Array<Record<string, unknown>>) ?? [];
    expect((projects[1]?.['test'] as Record<string, unknown>)?.['environment']).toBe('happy-dom');
    expect((testOf(config)['coverage'] as Record<string, unknown>)?.['thresholds']).toEqual({ statements: 87 });
  });
});

describe('defineIntegrationVitestConfig', () => {
  it('aliases the workspace without cloudflare mocks and collects .int tests', () => {
    const config = defineIntegrationVitestConfig({ scope: '@fixture', root: ROOT });
    const finds = aliasesOf(config).map((alias) => String(alias.find));
    expect(finds).toContain('@fixture/backend-data');
    expect(finds.some((find) => find.startsWith('cloudflare:'))).toBe(false);
    expect(testOf(config)['include']).toEqual(['test/integration/**/*.int.test.ts']);
  });

  it('covers the sqlite shape with no harness wiring', () => {
    const test = testOf(defineIntegrationVitestConfig({ scope: '@fixture', root: ROOT, include: ['test/integration/**/*.test.ts'] }));
    expect(test['include']).toEqual(['test/integration/**/*.test.ts']);
    expect(test['pool']).toBeUndefined();
  });
});
