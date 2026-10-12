import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseObjectLiteral, validateLocales, validateLocalesCli } from './validate-locales.ts';

function writeBundles(root: string, locale: string, bundle: Record<string, unknown>): string {
  const dir = join(root, locale);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'translation.json'), JSON.stringify(bundle), 'utf8');
  return root;
}

const EN = { common: { unauthorized: 'Unauthorized', forbidden: 'Forbidden' } };

describe('validateLocales', () => {
  it('passes when every locale mirrors the base keys', () => {
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeBundles(root, 'en', EN);
    writeBundles(root, 'de', { common: { unauthorized: 'Nicht autorisiert', forbidden: 'Verboten' } });
    const report = validateLocales(root);
    expect(report.locales).toStrictEqual(['de', 'en']);
    expect(report.keys).toBe(2);
    expect(report.problems).toStrictEqual([]);
  });

  it('reports both missing and extra keys', () => {
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeBundles(root, 'en', EN);
    writeBundles(root, 'de', { common: { unauthorized: 'x', oops: 'y' } });
    const problems = validateLocales(root).problems;
    expect(problems).toStrictEqual([
      { locale: 'de', problem: 'missing key: common.forbidden' },
      { locale: 'de', problem: 'extra key not in en: common.oops' },
    ]);
  });

  it('reports a missing directory and a missing base locale', () => {
    expect(validateLocales('/nonexistent-xyz').problems.length).toBeGreaterThan(0);
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeBundles(root, 'de', EN);
    expect(validateLocales(root).problems[0]?.problem).toContain('base locale');
  });

  it('supports flat <locale>.json bundles', () => {
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeFileSync(join(root, 'en.json'), JSON.stringify(EN), 'utf8');
    writeFileSync(join(root, 'de.json'), JSON.stringify({ common: { unauthorized: 'x', forbidden: 'y' } }), 'utf8');
    expect(validateLocales(root).problems).toStrictEqual([]);
  });

  it('CLI returns 1 with problems and 0 without', () => {
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeBundles(root, 'en', EN);
    writeBundles(root, 'de', { common: { unauthorized: 'x' } });
    expect(validateLocalesCli([root])).toBe(1);
    writeFileSync(join(root, 'de', 'translation.json'), JSON.stringify(EN), 'utf8');
    expect(validateLocalesCli([root])).toBe(0);
  });

  it('reads the module shape the kit i18n bundles use', () => {
    // `@rexezuge/i18n` ships `const enStrings: BackendStrings = { … }` per file, so
    // the same gate covers the backend catalogs and the SPA JSON bundles.
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeFileSync(
      join(root, 'en.ts'),
      "import type { BackendStrings } from '../BackendStrings';\n\nconst enStrings: BackendStrings = {\n  common: {\n    unauthorized: 'Authentication Required.',\n    forbidden: 'Access Denied.',\n  },\n};\n\nexport { enStrings };\n",
      'utf8',
    );
    writeFileSync(
      join(root, 'de.ts'),
      "const deStrings = {\n  common: {\n    unauthorized: 'Authentifizierung Erforderlich.',\n    forbidden: 'Zugriff Verweigert.',\n  },\n};\n",
      'utf8',
    );
    expect(validateLocales(root).problems).toStrictEqual([]);
  });

  it('extracts an object literal, ignoring the type annotation and the import', () => {
    const source = [
      "import type { BackendStrings } from '../BackendStrings';",
      '',
      'const enStrings: BackendStrings = {',
      "  common: { unauthorized: 'It\\'s fine', },",
      '};',
      '',
      'export { enStrings };',
    ].join('\n');
    expect(parseObjectLiteral(source, 'en.ts')).toStrictEqual({ common: { unauthorized: "It's fine" } });
  });

  it('reports an unparseable module rather than passing it silently', () => {
    const root = mkdtempSync(join(tmpdir(), 'locales-'));
    writeFileSync(join(root, 'en.ts'), 'const enStrings = {};\n', 'utf8');
    const problems = validateLocales(root).problems;
    expect(problems[0]?.problem).toMatch(/no keys|object literal/);
  });
});
