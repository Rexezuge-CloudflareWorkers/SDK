import { describe, expect, it } from 'vitest';
import { defineRepoLintConfig } from './eslint.ts';

/**
 * Structural checks on the produced flat config.
 *
 * These do not run ESLint — a rule that has to be observed linting is a rule this
 * suite cannot afford, and the repos' own suites lint their trees. What is asserted
 * here is the part that is a *decision* rather than a lint result: which paths are
 * ignored, which rules are errors rather than warnings, and that the boundary table
 * and the dynamic-`import()` guard agree with each other. A regression in any of
 * those is a config that silently stops gating something.
 */

/**
The only glob syntax the config uses: `**`, `*`, and `{a,b}` alternation.
*/
function globToRegExp(pattern: string): RegExp {
  const escape = (char: string): string => char.replaceAll(/[$()+.?[\\\]^{|}]/g, String.raw`\$&`);
  let out = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index] as string;
    if (char === '*' && pattern[index + 1] === '*') {
      out += '.*';
      index += 1;
      if (pattern[index + 1] === '/') index += 1;
    } else if (char === '*') {
      out += '[^/]*';
    } else if (char === '{') {
      const end = pattern.indexOf('}', index);
      const alternatives = pattern
        .slice(index + 1, end)
        .split(',')
        .map((alternative) => escape(alternative));
      out += `(?:${alternatives.join('|')})`;
      index = end;
    } else {
      out += escape(char);
    }
    index += 1;
  }
  return new RegExp(`^${out}$`);
}

/**
Every config object in the array, flattened through any nested arrays.
*/
function entries(config: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const entry of config as unknown[]) {
    if (Array.isArray(entry)) {
      out.push(...entries(entry));
    } else if (typeof entry === 'object' && entry !== null) {
      out.push(entry as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * True when the entry applies to `path`.
 *
 * An entry with no `files` key is global — the prettier block and the plugin presets
 * are written that way, so a matcher that required `files` would report them as
 * applying to nothing and the config's most important decision would look absent.
 */
function covers(entry: Record<string, unknown>, path: string): boolean {
  const files = entry['files'];
  if (!Array.isArray(files)) return true;
  return files.some((pattern) => typeof pattern === 'string' && globToRegExp(pattern).test(path));
}

/**
Every rule that applies to `path`, later entries winning.
*/
function rulesOf(config: unknown, path: string): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  for (const entry of entries(config)) {
    if (covers(entry, path)) Object.assign(rules, entry['rules']);
  }
  return rules;
}

/**
JSON of every rule block in the config. Rules are plain data; plugins are not.
*/
function rulesJson(config: unknown): string {
  return entries(config)
    .map((entry) => JSON.stringify(entry['rules'] ?? {}))
    .join('\n');
}

const config = defineRepoLintConfig({ scope: '@fixture' });

describe('defineRepoLintConfig', () => {
  it('ignores the generated and build trees but not the test suite', () => {
    const ignores = (config[0] as { ignores?: string[] }).ignores ?? [];
    expect(ignores).toContain('apps/api/src/generated/**');
    expect(ignores).toContain('apps/web/dist/**');
    // `test/**` is deliberately absent: Edge-Sonic's decision, and the one the
    // other source repos had the opposite of.
    expect(ignores.some((pattern) => pattern.startsWith('test/'))).toBe(false);
  });

  it('makes formatting drift an error, not a warning', () => {
    // `pnpm run lint` is `eslint --fix --quiet`, and `--quiet` discards warnings: a
    // `prettier/prettier` warning is a gate that has never run.
    expect(rulesOf(config, 'src/anything.ts')['prettier/prettier']).toBe('error');
  });

  it('gives web files browser globals in addition to node globals', () => {
    // The sources linted apps/web under globals.node only, so window and document
    // read as undefined globals — and the vitest web config runs those suites under
    // jsdom, so the lint environment disagreed with the execution environment.
    const webEntries = entries(config).filter((entry) => covers(entry, 'apps/web/src/main.tsx'));
    const browser = webEntries.flatMap((entry) =>
      Object.keys((entry as { languageOptions?: { globals?: Record<string, unknown> } }).languageOptions?.globals ?? {}),
    );
    expect(browser).toContain('window');
    expect(browser).toContain('document');
    // And the node globals survive: a shared file touching both still lints.
    expect(browser).toContain('process');
  });

  it('keeps the three plugin families on', () => {
    // sonarjs / unicorn / regexp are each a preset spread into the array; a preset
    // that failed to import would leave the array without their rule blocks.
    const all = rulesJson(config);
    expect(all).toContain('unicorn/');
    expect(all).toContain('sonarjs/');
    expect(all).toContain('regexp/');
  });

  it('parameterizes the boundary rules by scope', () => {
    const rules = rulesJson(config);
    expect(rules).toContain('@fixture/backend-data');
    expect(rules).not.toContain('@durable-dav/backend-data');
  });

  it('bans a backend package from the SPA, with a message that says why', () => {
    const rules = rulesJson(config);
    expect(rules).toContain('ships zero backend dependencies');
  });

  it('mirrors every boundary in a dynamic-import guard', () => {
    const syntax = rulesOf(config, 'packages/backend-runtime/src/x.ts')['no-restricted-syntax'];
    expect(Array.isArray(syntax)).toBe(true);
    // `no-restricted-imports` reads ImportDeclaration only, so the same boundary has
    // to be stated for ImportExpression too — that hole was load-bearing in
    // Edge-Sonic, where the credential path reached a banned module through it.
    expect(JSON.stringify(syntax)).toContain("ImportExpression[source.type='Literal']");
    expect(JSON.stringify(syntax)).toContain('@fixture/backend-data');
  });

  it('relaxes the Vitest idioms in tests but not the correctness rules', () => {
    const rules = rulesOf(config, 'test/schema.test.ts');
    expect(rules['@typescript-eslint/unbound-method']).toBe('off');
    expect(rules['unicorn/prefer-https']).toBe('off');
    expect(rules['sonarjs/no-clear-text-protocols']).toBe('off');
    // Unused variables stay on in tests, at exactly the severity the product
    // source gets: a dead fake is a defect, not an artefact of test shape.
    expect(rules['@typescript-eslint/no-unused-vars']).toStrictEqual(
      rulesOf(config, 'src/anything.ts')['@typescript-eslint/no-unused-vars'],
    );
  });

  it('keeps the family offs off after the presets assemble', () => {
    // UNICORN_RULES carries `sonarjs/*` offs as well as `unicorn/*` ones, and
    // flat-config later entries win: a preset assembled after the block
    // re-enables whatever the block relaxed. That shipped — the sonarjs preset
    // sat between the block and its own rules, so six deliberate offs linted
    // as errors in every consumer. Asserted on the merged result, because the
    // block alone always said the right thing; only the assembly was wrong.
    const rules = rulesOf(config, 'packages/backend-data/src/dao/x.ts');
    for (const rule of [
      'sonarjs/void-use',
      'sonarjs/different-types-comparison',
      'sonarjs/use-type-alias',
      'sonarjs/redundant-type-aliases',
      'sonarjs/no-nested-assignment',
      'sonarjs/no-all-duplicated-branches',
    ]) {
      expect(rules[rule]).toBe('off');
    }
  });

  it('covers the family superset of domain layers', () => {
    // provider-clients (AWS/CalDAV/Meow/Otter), webdav/dav-store (DAV/Router/Sonic),
    // git-protocol/git-service (Git): a repo without the package never imports it,
    // so the union is safe and no repo needs extraLayers for a known package.
    const rules = rulesJson(config);
    expect(rules).toContain('@fixture/provider-clients');
    expect(rules).toContain('@fixture/webdav');
    expect(rules).toContain('@fixture/dav-store');
    expect(rules).toContain('@fixture/git-protocol');
    expect(rules).toContain('@fixture/git-service');
  });

  it('bans direct client imports from apps/api with the per-client alternative', () => {
    const rules = rulesJson(config);
    expect(rules).toContain('must not import provider-clients directly');
    expect(rules).toContain('must not import dav-store directly');
    expect(rules).toContain('must not import git-service directly');
    // And the DAO ban still allows type-only imports beside them.
    expect(rules).toContain('allowTypeImports');
  });

  it('accepts extra layers without losing the canonical ones', () => {
    const extended = defineRepoLintConfig({
      scope: '@fixture',
      extraLayers: [
        {
          dir: 'apps/api/src/endpoints',
          ban: ['@fixture/backend-data/dao'],
          allowTypeImports: true,
          message: 'route classes must not import DAOs directly',
        },
      ],
    });
    const rules = rulesJson(extended);
    expect(rules).toContain('route classes must not import DAOs directly');
    expect(rules).toContain('zero-dependency base layer');
    expect(rules).toContain('ships zero backend dependencies');
  });
});
