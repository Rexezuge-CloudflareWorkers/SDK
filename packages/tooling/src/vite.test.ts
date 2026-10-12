import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defineWebViteConfig, spaShellEmbedPlugin } from './vite.ts';

const created: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vite-config-'));
  created.push(root);
  return root;
}

afterAll(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
});

const REAL_HTML = `<!doctype html><html><head><meta charset="utf-8" /><title>Fixture</title><script type="module" src="/assets/index-abc123.js"></script></head><body><div id="root"></div><!-- padding so the shell is a real document --></body></html>`;

/** A build output: `dist/index.html` plus the bundle it references. */
function writeBuild(root: string): void {
  mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.html'), REAL_HTML, 'utf8');
  writeFileSync(join(root, 'dist', 'assets', 'index-abc123.js'), 'console.log(1)', 'utf8');
}

describe('defineWebViteConfig', () => {
  it('empties the output directory by default', () => {
    // A stale asset in dist is served as a live bundle, which is the same
    // half-refreshed build verify-spa-shell rejects.
    expect(defineWebViteConfig().build).toMatchObject({ outDir: 'dist', emptyOutDir: true });
  });

  it('passes the proxy through as data', () => {
    const config = defineWebViteConfig({ proxy: { '/user': { target: 'http://localhost:8787', changeOrigin: true } } });
    expect(config.server).toMatchObject({ proxy: { '/user': { target: 'http://localhost:8787' } } });
  });

  it('registers the spa-shell plugin only when a target is given', () => {
    const withShell = defineWebViteConfig({ plugins: [], spaShell: { path: 'apps/api/src/generated/spa-shell.ts' } });
    const without = defineWebViteConfig({ plugins: [] });
    expect(withShell.plugins?.map((plugin) => plugin.name)).toContain('spa-shell-embed');
    expect(without.plugins ?? []).toStrictEqual([]);
  });
});

describe('spaShellEmbedPlugin', () => {
  it('writes the generated module from the built index.html', async () => {
    const root = tempRoot();
    writeBuild(root);

    const plugin = spaShellEmbedPlugin({ path: 'apps/api/src/generated/spa-shell.ts', root });
    await plugin.closeBundle?.();

    const written = readFileSync(join(root, 'apps/api/src/generated/spa-shell.ts'), 'utf8');
    expect(written).toContain('export const SPA_HTML: string = ');
    expect(written).toContain('DO NOT EDIT');
    // A verbatim copy: verify-spa-shell compares the two byte for byte.
    expect(JSON.parse(written.slice(written.indexOf('= ') + 2, written.lastIndexOf(';')).trim())).toBe(REAL_HTML);
  });

  it('skips a build that emitted no index.html, rather than failing it', () => {
    const root = tempRoot();
    const plugin = spaShellEmbedPlugin({ path: 'apps/api/src/generated/spa-shell.ts', root });
    // closeBundle runs on every build, including library builds with no HTML.
    expect(() => plugin.closeBundle?.()).not.toThrow();
    expect(existsSync(join(root, 'apps/api/src/generated/spa-shell.ts'))).toBe(false);
  });

  it('resolves against the build directory, never against this module', async () => {
    const root = tempRoot();
    writeBuild(root);
    mkdirSync(dirname(join(root, 'apps/api/src/generated')), { recursive: true });

    const plugin = spaShellEmbedPlugin({ path: 'apps/api/src/generated/spa-shell.ts', root });
    await plugin.closeBundle?.();

    expect(existsSync(join(root, 'apps/api/src/generated/spa-shell.ts'))).toBe(true);
    // The kit's own directory must not gain a generated file from a consumer's build.
    expect(existsSync(join(process.cwd(), 'apps/api/src/generated/spa-shell.ts'))).toBe(false);
  });
});
