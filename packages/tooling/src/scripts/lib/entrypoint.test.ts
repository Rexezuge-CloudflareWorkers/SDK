import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEntrypoint } from './entrypoint.ts';

function repo(): string {
  return mkdtempSync(path.join(tmpdir(), 'entrypoint-'));
}

describe('isEntrypoint', () => {
  it('matches when the entrypoint is the file itself', () => {
    const file = path.join(repo(), 'script.mjs');
    writeFileSync(file, '');
    expect(isEntrypoint(`file://${file}`, file)).toBe(true);
  });

  it('matches through a symlink, which is how pnpm installs every package', () => {
    // The regression. `process.argv[1]` is whatever the caller typed —
    // `node_modules/@rexezuge/tooling/dist/scripts/x.js`, a symlink into the
    // store — while `import.meta.url` is always the realpath, because the ESM
    // resolver follows links. Comparing the two unresolved returns false, the
    // guard never fires, and the script exits 0 having printed nothing.
    //
    // For a *gate* that is the worst shape a failure can take: `validate-locales`
    // passed with a key missing from eleven bundles and `check-god-files` reported
    // no file over the limit, both silently. Found by a consumer swapping in its
    // own copy and finding the replacement stopped catching what the old one
    // reported on the same tree.
    const root = repo();
    const store = path.join(root, 'store', 'tooling');
    mkdirSync(path.join(store, 'dist'), { recursive: true });
    const real = path.join(store, 'dist', 'script.mjs');
    writeFileSync(real, '');
    // The pnpm layout: `node_modules/@rexezuge/tooling` is a symlink to the store.
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(path.dirname(store), path.join(root, 'node_modules', '@rexezuge'), 'dir');
    const entry = path.join(root, 'node_modules', '@rexezuge', 'tooling', 'dist', 'script.mjs');
    expect(isEntrypoint(`file://${real}`, entry)).toBe(true);
  });

  it('does not match the module a suite imported', () => {
    // The reason the guard exists: these modules export their rules so the tests
    // can import them, and during a test run `argv[1]` is the test file.
    const root = repo();
    const test = path.join(root, 'thing.test.ts');
    const script = path.join(root, 'script.mjs');
    writeFileSync(test, '');
    writeFileSync(script, '');
    expect(isEntrypoint(`file://${script}`, test)).toBe(false);
  });

  it('does not match when the entrypoint is absent, or does not resolve', () => {
    // Exercised through the real default rather than by passing `undefined`:
    // `isEntrypoint` reads `process.argv[1]`, and under a test run that is the
    // test file, which is the case the guard exists to exclude anyway.
    expect(isEntrypoint('file:///nope.mjs')).toBe(false);
    expect(isEntrypoint('file:///nope.mjs', '/also/not/here.mjs')).toBe(false);
  });
});
