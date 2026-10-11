import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkGodFiles, checkGodFilesCli, readAllowlist, HARD_LIMIT, SOFT_LIMIT } from './check-god-files';

function tempTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'god-files-'));
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  return root;
}

const pad = (lines: number): string => Array.from({ length: lines }, (_, index) => `// line ${index}`).join('\n');

describe('checkGodFiles', () => {
  it('passes a small product source tree', () => {
    const root = tempTree({ 'src/app.ts': pad(10) });
    const report = checkGodFiles({ root });
    expect(report.passed).toBe(true);
    expect(report.findings).toStrictEqual([]);
    expect(report.scanned).toBe(1);
  });

  it('reports over-soft as warn and over-hard as critical', () => {
    const soft = checkGodFiles({ root: tempTree({ 'src/medium.ts': pad(320) }) });
    expect(soft.findings).toStrictEqual([{ file: 'src/medium.ts', lines: 320, level: 'warn' }]);
    expect(soft.passed).toBe(true); // warn-only is the family's gate

    const hard = checkGodFiles({ root: tempTree({ 'src/huge.ts': pad(450) }) });
    expect(hard.findings[0]).toMatchObject({ file: 'src/huge.ts', level: 'critical' });
    expect(hard.passed).toBe(true); // still passes without --fail-on-hard
  });

  it('fails only when the caller opts into the hard gate', () => {
    const root = tempTree({ 'src/huge.ts': pad(450) });
    expect(checkGodFiles({ root, failOnHard: true }).passed).toBe(false);
    expect(checkGodFiles({ root, failOnHard: false }).passed).toBe(true);
    expect(checkGodFiles({ root }).passed).toBe(true);
  });

  it('keeps allowlisted files out of the findings but still reports them', () => {
    const root = tempTree({ 'src/huge.ts': pad(450), 'src/other.ts': pad(350) });
    const report = checkGodFiles({ root, allowlist: ['src/huge.ts'] });
    expect(report.findings).toStrictEqual([{ file: 'src/other.ts', lines: 350, level: 'warn' }]);
    expect(report.allowlisted).toStrictEqual([{ file: 'src/huge.ts', lines: 450, level: 'critical' }]);
    expect(report.passed).toBe(true);
  });

  it('ignores tests, generated, locales, scripts, configs, and lockfiles', () => {
    const root = tempTree({
      'src/app.test.ts': pad(500),
      'src/generated/x.ts': pad(500),
      'src/locales/de/translation.json': JSON.stringify({ a: 'b' }),
      'scripts/build.ts': pad(500),
      'vite.config.ts': pad(500),
      'package.json': '{}',
      'migrations/0001_init.sql': 'SELECT 1;',
    });
    expect(checkGodFiles({ root }).scanned).toBe(0);
  });

  it('skips node_modules, dist, and caches', () => {
    const root = tempTree({
      'node_modules/pkg/index.ts': pad(500),
      'dist/bundle.js': pad(500),
      'coverage/report.js': pad(500),
    });
    expect(checkGodFiles({ root }).scanned).toBe(0);
  });

  it('sorts findings worst-first', () => {
    const root = tempTree({ 'src/a.ts': pad(320), 'src/b.ts': pad(450), 'src/c.ts': pad(360) });
    expect(checkGodFiles({ root }).findings.map((finding) => finding.file)).toStrictEqual(['src/b.ts', 'src/c.ts', 'src/a.ts']);
  });
});

describe('readAllowlist', () => {
  it('returns [] for an absent file', () => {
    expect(readAllowlist('/nonexistent-xyz/allowlist.json')).toStrictEqual([]);
  });

  it('rejects a malformed allowlist rather than reading it as empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'god-allow-'));
    const path = join(root, 'allowlist.json');
    writeFileSync(path, '{ not: an array }', 'utf8');
    expect(() => readAllowlist(path)).toThrow(/not valid JSON/);
  });

  it('rejects a non-array allowlist', () => {
    const root = mkdtempSync(join(tmpdir(), 'god-allow-'));
    const path = join(root, 'allowlist.json');
    writeFileSync(path, '{"src/a.ts": 400}', 'utf8');
    expect(() => readAllowlist(path)).toThrow(/JSON array of repo-relative path strings/);
  });

  it('reads a valid allowlist', () => {
    const root = mkdtempSync(join(tmpdir(), 'god-allow-'));
    const path = join(root, 'allowlist.json');
    writeFileSync(path, '["a.ts", "b.ts"]', 'utf8');
    expect(readAllowlist(path)).toStrictEqual(['a.ts', 'b.ts']);
  });
});

describe('checkGodFilesCli', () => {
  it('returns 0 in the default warn-only mode, even over the hard limit', () => {
    const root = tempTree({ 'src/huge.ts': pad(450) });
    expect(checkGodFilesCli(['--root', root])).toBe(0);
  });

  it('exits non-zero with --fail-on-hard over the hard limit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const root = tempTree({ 'src/huge.ts': pad(450) });
    checkGodFilesCli(['--root', root, '--fail-on-hard']);
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });

  it('returns 0 on a clean tree with the gate on', () => {
    const root = tempTree({ 'src/app.ts': pad(10) });
    expect(checkGodFilesCli(['--root', root, '--fail-on-hard'])).toBe(0);
  });

  it('exposes the family constants', () => {
    expect(SOFT_LIMIT).toBe(300);
    expect(HARD_LIMIT).toBe(400);
  });
});
