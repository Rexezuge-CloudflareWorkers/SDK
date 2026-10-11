import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyMigrations, verifyMigrationsCli, LOCK_NAME } from './verify-migrations';

function tempMigrations(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content, 'utf8');
  }
  return root;
}

const ONE = 'CREATE TABLE users (id TEXT);';
const TWO = 'CREATE TABLE namespaces (user_id TEXT);';

describe('verifyMigrations', () => {
  it('passes a correctly named, locked set', () => {
    const root = tempMigrations({ '0001_init.sql': ONE, '0002_more.sql': TWO });
    verifyMigrations(root, { write: true });
    const report = verifyMigrations(root);
    expect(report.problems).toStrictEqual([]);
    expect(report.files).toStrictEqual(['0001_init.sql', '0002_more.sql']);
  });

  it('fails when the lock is missing', () => {
    const root = tempMigrations({ '0001_init.sql': ONE });
    const report = verifyMigrations(root);
    expect(report.problems[0]?.problem).toContain('missing');
  });

  it('fails when a migration changed after locking', () => {
    const root = tempMigrations({ '0001_init.sql': ONE });
    verifyMigrations(root, { write: true });
    writeFileSync(join(root, '0001_init.sql'), 'CREATE TABLE changed (id TEXT);', 'utf8');
    const report = verifyMigrations(root);
    expect(report.problems.map((problem) => problem.problem).join('\n')).toContain('changed after locking');
  });

  it('fails on a bad name or a gap in numbering', () => {
    const bad = tempMigrations({ 'users.sql': ONE });
    expect(verifyMigrations(bad).problems.map((problem) => problem.problem).join('\n')).toContain('does not match');

    const gap = tempMigrations({ '0001_init.sql': ONE, '0003_skipped.sql': TWO });
    expect(verifyMigrations(gap).problems.map((problem) => problem.problem).join('\n')).toContain('not contiguous');
  });

  it('fails when a locked migration no longer exists', async () => {
    const root = tempMigrations({ '0001_init.sql': ONE, '0002_more.sql': TWO });
    verifyMigrations(root, { write: true });
    const { rmSync } = await import('node:fs');
    rmSync(join(root, '0002_more.sql'));
    expect(verifyMigrations(root).problems.map((problem) => problem.problem).join('\n')).toContain('no longer exists');
  });

  it('writes a lock with per-file sha256 entries', () => {
    const root = tempMigrations({ '0001_init.sql': ONE });
    const report = verifyMigrations(root, { write: true });
    expect(report.problems).toStrictEqual([]);
    const lock = JSON.parse(readFileSync(join(root, LOCK_NAME), 'utf8')) as { migrations: { sha256: string }[] };
    expect(lock.migrations[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('CLI: verify fails unloked, --write fixes it, verify then passes', () => {
    const root = tempMigrations({ '0001_init.sql': ONE });
    expect(verifyMigrationsCli([root])).toBe(1);
    expect(verifyMigrationsCli([root, '--write'])).toBe(0);
    expect(verifyMigrationsCli([root])).toBe(0);
  });
});
