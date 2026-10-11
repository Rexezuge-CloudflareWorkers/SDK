import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureSpaShellStub, spaShellCli, verifySpaShell } from './spa-shell';

function tempTree(): string {
  return mkdtempSync(join(tmpdir(), 'spa-shell-'));
}

function writeBuild(root: string, html: string): void {
  const shell = join(root, 'apps/api/src/generated');
  mkdirSync(shell, { recursive: true });
  writeFileSync(join(shell, 'spa-shell.ts'), `export const SPA_HTML: string = ${JSON.stringify(html)};\n`, 'utf8');
  const distAssets = join(root, 'apps/web/dist/assets');
  mkdirSync(distAssets, { recursive: true });
  writeFileSync(join(root, 'apps/web/dist/index.html'), html, 'utf8');
  for (const asset of html.matchAll(/\/assets\/([^"]+)/g)) {
    writeFileSync(join(distAssets, asset[1] as string), 'console.log(1)', 'utf8');
  }
}

const REAL_HTML = `<!doctype html><html><head><meta charset="utf-8" /><title>Spa Shell Fixture</title><link rel="stylesheet" href="/assets/index-def456.css" /><script type="module" src="/assets/index-abc123.js"></script></head><body><div id="root"></div><!-- fixture padding so the shell exceeds the 200-char minimum --></body></html>`;

describe('ensureSpaShellStub', () => {
  it('creates the stub when absent', () => {
    const root = tempTree();
    const result = ensureSpaShellStub({ root });
    expect(result.created).toBe(true);
    expect(existsSync(join(root, 'apps/api/src/generated/spa-shell.ts'))).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain("SPA_HTML: string = ''");
  });

  it('never overwrites an existing file', () => {
    const root = tempTree();
    const path = join(root, 'apps/api/src/generated', 'spa-shell.ts');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'real content', 'utf8');
    const result = ensureSpaShellStub({ root });
    expect(result.created).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe('real content');
  });
});

describe('verifySpaShell', () => {
  it('passes a self-consistent build', () => {
    const root = tempTree();
    writeBuild(root, REAL_HTML);
    expect(verifySpaShell({ root }).problems).toStrictEqual([]);
  });

  it('reports a missing shell', () => {
    const root = tempTree();
    const { problems } = verifySpaShell({ root });
    expect(problems.join('\n')).toContain('is missing');
  });

  it('reports the postinstall stub', () => {
    const root = tempTree();
    const path = join(root, 'apps/api/src/generated', 'spa-shell.ts');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export const SPA_HTML: string = '';\n", 'utf8');
    expect(verifySpaShell({ root }).problems.join('\n')).toContain('postinstall stub');
  });

  it('reports referenced-but-missing assets', () => {
    const root = tempTree();
    writeBuild(root, REAL_HTML);
    rmSync(join(root, 'apps/web/dist/assets'), { recursive: true, force: true });
    expect(verifySpaShell({ root }).problems.join('\n')).toContain('/assets/index-abc123.js');
  });

  it('reports a shell that disagrees with dist/index.html', () => {
    const root = tempTree();
    writeBuild(root, REAL_HTML);
    writeFileSync(join(root, 'apps/web/dist/index.html'), '<!doctype html><html>different</html>', 'utf8');
    expect(verifySpaShell({ root }).problems.join('\n')).toContain('does not match');
  });
});

describe('spaShellCli', () => {
  it('verifies and reports per mode', () => {
    const root = tempTree();
    expect(spaShellCli(['ensure', root])).toBe(0);
    expect(spaShellCli(['ensure', root])).toBe(0);
    expect(spaShellCli(['verify', root])).toBe(1); // still the stub
    writeBuild(root, REAL_HTML);
    expect(spaShellCli(['verify', root])).toBe(0);
    expect(spaShellCli(['bogus', root])).toBe(1);
  });
});
