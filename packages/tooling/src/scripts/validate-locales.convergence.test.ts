import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLocales, validateLocalesCli } from './validate-locales.ts';

function repo(): string {
  return mkdtempSync(path.join(tmpdir(), 'locales-'));
}

function bundle(root: string, tag: string, value: Record<string, unknown>): void {
  const dir = path.join(root, 'locales', tag);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'translation.json'), JSON.stringify(value));
}

describe('validateLocales', () => {
  it('passes on two-way parity alone', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save', cancel: 'Cancel' } });
    bundle(root, 'de', { common: { save: 'Speichern', cancel: 'Abbrechen' } });
    expect(validateLocales(path.join(root, 'locales')).problems).toEqual([]);
  });

  it('reports an empty value, which is indistinguishable from a missing key', () => {
    // The check the header advertised and did not implement. i18next renders `''`
    // for an empty value and for an absent key alike, so a locale can look complete
    // in a diff and be blank on the page.
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    bundle(root, 'de', { common: { save: '' } });
    const problems = validateLocales(path.join(root, 'locales')).problems;
    expect(problems.some((problem) => problem.problem.includes('empty value: common.save'))).toBe(true);
  });

  it('reports a non-string value', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    bundle(root, 'de', { common: { save: 42 } });
    const problems = validateLocales(path.join(root, 'locales')).problems;
    expect(problems.some((problem) => problem.problem.includes('empty value'))).toBe(true);
  });

  it('reports a dropped placeholder', () => {
    // Substitution is by name, so a translation that drops `{{count}}` renders the
    // sentence with a hole in it and no error anywhere.
    const root = repo();
    bundle(root, 'en', { libraries: { indexed: 'Indexed {{count}} tracks' } });
    bundle(root, 'de', { libraries: { indexed: 'Indizierte Tracks' } });
    const problems = validateLocales(path.join(root, 'locales')).problems;
    expect(problems.some((problem) => problem.problem.includes('placeholder mismatch at libraries.indexed'))).toBe(true);
  });

  it('accepts a placeholder that moved position', () => {
    const root = repo();
    bundle(root, 'en', { greeting: 'Hi {{name}}, you have {{count}}' });
    bundle(root, 'de', { greeting: '{{count}} Nachrichten für {{name}}' });
    expect(validateLocales(path.join(root, 'locales')).problems).toEqual([]);
  });

  it('reports a placeholder the base never had', () => {
    const root = repo();
    bundle(root, 'en', { greeting: 'Hi {{name}}' });
    bundle(root, 'de', { greeting: 'Hi {{name}} {{surname}}' });
    const problems = validateLocales(path.join(root, 'locales')).problems;
    expect(problems.some((problem) => problem.problem.includes('placeholder mismatch'))).toBe(true);
  });

  it('reports both a missing and an extra key', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save', cancel: 'Cancel' } });
    bundle(root, 'de', { common: { save: 'Speichern', extra: 'Zusatz' } });
    const problems = validateLocales(path.join(root, 'locales')).problems.map((problem) => problem.problem);
    expect(problems.some((problem) => problem.includes('missing key: common.cancel'))).toBe(true);
    expect(problems.some((problem) => problem.includes('extra key not in en: common.extra'))).toBe(true);
  });

  it('reports a bundle on disk with no declared counterpart', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    bundle(root, 'fr', { common: { save: 'Enregistrer' } });
    const report = validateLocales(path.join(root, 'locales'));
    expect(report.locales).toEqual(['en', 'fr']);
    expect(report.problems).toEqual([]);
  });

  it('refuses an empty base rather than reporting all clear', () => {
    const root = repo();
    bundle(root, 'en', {});
    bundle(root, 'de', {});
    const problems = validateLocales(path.join(root, 'locales')).problems;
    expect(problems.some((problem) => problem.problem.includes('has no keys'))).toBe(true);
  });

  it('reports a directory that does not exist', () => {
    const root = repo();
    expect(validateLocales(path.join(root, 'nope')).problems.length).toBe(1);
  });
});

/**
 * Capture what the CLI wrote, so a gate's exit code and its report can be asserted
 * together. The alternative — reading stdout — makes the test depend on the
 * reporter's formatting rather than on the finding.
 */
function capture(fn: () => number): { code: number; out: string } {
  const original = { error: console.error, log: console.log };
  let out = '';
  console.error = (...args: unknown[]): void => void (out += `${args.join(' ')}\n`);
  console.log = (...args: unknown[]): void => void (out += `${args.join(' ')}\n`);
  try {
    return { code: fn(), out };
  } finally {
    console.error = original.error;
    console.log = original.log;
  }
}

describe('validateLocalesCli --call-sites', () => {
  it('passes a call site whose inline default equals the bundle', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'Button.tsx'), "const label = t('common.save', 'Save');\n");
    const { code, out } = capture(() => validateLocalesCli([path.join(root, 'locales'), `--call-sites=${src}`]));
    expect(out).toContain('Locale validation passed');
    expect(code).toBe(0);
  });

  it('passes a default containing an apostrophe, which is the ordinary case', () => {
    // The defect a real corpus found: a scan for either quote character stops at the
    // apostrophe in `D1's` and reports `D1` as the whole default, so every line
    // quoting an English possessive becomes a false "default disagrees".
    const root = repo();
    const text = "D1's daily write allowance is spent. Paused until {{time}} UTC; the scan resumes itself.";
    bundle(root, 'en', { libraries: { scanPaused: text } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'LibraryRow.tsx'), `const paused = t('libraries.scanPaused', ${JSON.stringify(text)});\n`);
    const { code, out } = capture(() => validateLocalesCli([path.join(root, 'locales'), `--call-sites=${src}`]));
    expect(out).toContain('Locale validation passed');
    expect(code).toBe(0);
  });

  it('fails a call site whose key is not in the bundle', () => {
    // The check the header advertised and never implemented: bundle-to-bundle parity
    // cannot see a key the application uses and the bundle lacks, because with one
    // shipped language the whole per-tag body is skipped.
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'View.tsx'), "const label = t('common.saved');\n");
    const { code, out } = capture(() => validateLocalesCli([path.join(root, 'locales'), `--call-sites=${src}`]));
    expect(out).toContain("t('common.saved') is not in the bundle");
    expect(code).toBe(1);
  });

  it('fails a default that disagrees with the bundle', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'View.tsx'), "const label = t('common.save', 'Store');\n");
    const { code, out } = capture(() => validateLocalesCli([path.join(root, 'locales'), `--call-sites=${src}`]));
    expect(out).toContain('default disagrees with the bundle');
    expect(code).toBe(1);
  });

  it('skips a dynamic key rather than guessing at it', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'View.tsx'), 'const label = t(`common.${name}`);\n');
    const { code } = capture(() => validateLocalesCli([path.join(root, 'locales'), `--call-sites=${src}`]));
    expect(code).toBe(0);
  });

  it('does not look at call sites without the flag', () => {
    const root = repo();
    bundle(root, 'en', { common: { save: 'Save' } });
    const src = path.join(root, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'View.tsx'), "const label = t('common.neverShipped');\n");
    const { code } = capture(() => validateLocalesCli([path.join(root, 'locales')]));
    expect(code).toBe(0);
  });
});
