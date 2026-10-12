/**
 * The converged ESLint flat config for a monorepo in the Rexezuge family.
 *
 * Provenance: the base is Durable-DAV's `eslint.config.mjs` (the most
 * elaborate of the nine repos, with the layered `no-restricted-imports` boundary
 * rules). Merged in from the stacks that share the same plugin set:
 *
 * - **Edge-Sonic** — `test/**` is *not* ignored (it is linted like everything else,
 *   with a narrow override block for Vitest idioms), and `unicorn/prefer-ternary`
 *   is off. Edge-Sonic is also the source for the dynamic-`import()` boundary
 *   guard and its `apps/web` layer block.
 * - **Mail-Meow** — `prettier/prettier` is an **error**, not a warning.
 * - **AWS-AccessBridge** — the `apps/api` DAO/service boundary uses
 *   `allowTypeImports` where the source repos do not. It is also the source for
 *   the anchored skip patterns and the symlink-safe walk that came out of its own
 *   backlog.
 * - **CalDAV-Bridge, Mail-Otter, Durable-DAV-Router, Edge-Git, Agent-Router** —
 *   the `provider-clients` / `webdav`+`dav-store` / `git-protocol`+`git-service`
 *   layers and the per-client `apps/api` alternatives in the boundary table.
 *
 * Canonical decisions, and why each one:
 *
 * 1. **`prettier/prettier: 'error'`.** Three of the four source repos had it at
 *    `warn`, which under `eslint --quiet` is unenforceable — a gate nobody can see
 *    is a gate that has never run. Formatting drift is therefore a hard failure.
 * 2. **The layered boundary rules are parameterized by `scope`.** Every source
 *    repo wrote the same blocks with a different npm scope hardcoded; the
 *    factory takes `scope` (`'@myapp'`) and generates the `@myapp/*` patterns.
 *    The table itself lives in {@link ./eslint-boundaries.ts} and covers the
 *    family superset — a repo without a domain package never triggers its ban,
 *    so no repo needs `extraLayers` for a known package.
 * 3. **`test/**` is linted, not ignored.** Durable-DAV/AWS/Mail-Meow ignored it;
 *    Edge-Sonic does not, and records why: ~200 KB of test code had accumulated
 *    violations that nothing reported.
 * 4. **`apps/web` is a layer in its own right**, banned from every `@scope/*`
 *    package. Edge-Sonic is the only source with that block; the others had none,
 *    which is how their layer table's "may import: the browser" was a convention
 *    rather than a gate. A backend package imported by the SPA compiles and then
 *    fails at bundle time, with the error pointing at the bundler.
 * 5. **jsdom + node globals for web files.** The sources ran `globals.node` only;
 *    `apps/web` needs browser globals as well, and the vitest config for the SPA
 *    runs under jsdom, so the lint environment matches the test environment.
 * 6. **`eslint-plugin-react-hooks` is NOT imported here.** The kit stays
 *    zero-dependency, and the plugin belongs to the app that has JSX. A consumer
 *    appends it — the README shows the four lines.
 *
 * The rule bodies live in {@link ./eslint-rules.ts} and the boundary table in
 * {@link ./eslint-boundaries.ts}; this file is the assembly. A repo that needs a
 * boundary the canonical table does not name passes `extraLayers` — see
 * {@link RepoLintConfigOptions}.
 */

import globals from 'globals';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
import pluginRegexp from 'eslint-plugin-regexp';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import type { FlatConfig } from 'typescript-eslint';
import { DEFAULT_PROJECT_DIRS, layerBans, restrictedDynamicImports, restrictedImports } from './eslint-boundaries.ts';
import type { LayerBan } from './eslint-boundaries.ts';
import { SONARJS_RULES, TEST_RULES, TYPESCRIPT_RULES, UNICORN_RULES } from './eslint-rules.ts';

/**
 * What `defineRepoLintConfig` accepts.
 */
export interface RepoLintConfigOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`. Every `no-restricted-imports`
   * pattern in the boundary rules is derived from it, so the same factory serves
   * all nine repos.
   */
  readonly scope: string;
  /**
   * The workspace directories the layered boundary rules are scoped to, as repo-
   * relative globs. Defaults to the canonical layout the nine repos share.
   */
  readonly projectDirs?: readonly string[];
  /**
   * Extra ignore globs, merged with the canonical set.
   */
  readonly extraIgnores?: readonly string[];
  /**
   * Where `projectService` resolves the tsconfig from. Defaults to the directory
   * ESLint is invoked in, which is the repo root in every CI job.
   */
  readonly tsconfigRootDir?: string;
  /**
   * Extra boundary layers, appended to the canonical table.
   *
   * The escape valve for a repo whose layout has a boundary the canonical table
   * does not name — AWS-AccessBridge's `apps/api/src/endpoints/**` rule ("route
   * classes must not import DAOs directly") and its `aws4fetch` ban are the shape.
   * Same {@link LayerBan} form, so `extraLayers` flows through the
   * `no-restricted-imports` and the `no-restricted-syntax` guard alike.
   */
  readonly extraLayers?: readonly LayerBan[];
}

/**
 * One argument to `tseslint.config()`.
 */
type ConfigInput = Parameters<typeof tseslint.config>[number];

/**
 * A plugin preset or config object as the source repos pass it.
 */
type MaybeConfig = FlatConfig.Config | readonly FlatConfig.Config[];

/**
 * Bridge a third-party preset into `tseslint.config()`.
 *
 * `sonarjs`' `recommended` preset is typed as a union that includes the legacy
 * config shape, which `tseslint.config()` does not accept — but ESLint accepts it
 * at runtime, which is the only thing that matters here. One checked assertion,
 * rather than forking the plugin's own types.
 */
function asConfig(config: MaybeConfig): ConfigInput {
  return config as ConfigInput;
}

/**
 * Bridge a rule block onto `tseslint.config()`'s `rules` field.
 *
 * The blocks in `eslint-rules.ts` are written as ESLint expects them —
 * `'off' | 'warn' | 'error' | [level, ...options]` — but spelled as data so a
 * rule's reason comment sits beside the rule itself. ESLint's own `RuleEntry`
 * union is narrower than the data shape, and widening every entry to that union
 * would buy nothing; one assertion here, with the reason, is the cheaper and
 * more honest of the two.
 */
function asRules(block: Readonly<Record<string, unknown>>): FlatConfig.Config['rules'] {
  return block as FlatConfig.Config['rules'];
}

/**
 * Build the repo's flat config.
 *
 * Consumed from the repo root as three lines:
 *
 * ```js
 * // eslint.config.mjs
 * import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';
 * export default defineRepoLintConfig({ scope: '@myapp' });
 * ```
 */
export function defineRepoLintConfig(options: RepoLintConfigOptions): FlatConfig.ConfigArray {
  const { scope } = options;
  const projectDirs = options.projectDirs ?? DEFAULT_PROJECT_DIRS;
  const canonical = layerBans(scope).filter((layer) => projectDirs.some((dir) => layer.dir.startsWith(dir)));
  const extra = options.extraLayers ?? [];
  const bans = [...canonical, ...extra];

  return tseslint.config(
    {
      ignores: [
        'eslint.config.mjs',
        'eslint.config.js',
        'scripts/**',
        'worker-configuration.d.ts',
        'local/**',
        'app/dist/**',
        'apps/web/dist/**',
        'apps/*/dist/**',
        'src/generated/**',
        'apps/api/src/generated/**',
        'coverage/**',
        'coverage-integration/**',
        'coverage-web/**',
        'node_modules/**',
        ...(options.extraIgnores ?? []),
      ],
    },

    // Base: globals for all JS/TS source files. Node is the floor because the
    // scripts and the workers both run on it; the web block below adds browser
    // globals rather than replacing them, so a shared file that touches both
    // (there are several in `shared/`) still lints.
    {
      files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}'],
      languageOptions: {
        globals: globals.node,
      },
    },

    // Type-aware TS rules, scoped to TS files only.
    {
      files: ['**/*.{ts,mts,cts,tsx}'],
      extends: tseslint.configs.recommendedTypeChecked,
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: options.tsconfigRootDir ?? process.cwd(),
        },
      },
    },

    // --- typescript-eslint overrides (identical in all four source stacks) ---
    {
      files: ['**/*.{ts,mts,cts,tsx}'],
      rules: asRules(TYPESCRIPT_RULES),
    },

    // --- Unicorn: modern JS/TS quality rules ---
    asConfig(unicorn.configs['flat/recommended']),
    {
      rules: asRules(UNICORN_RULES),
    },

    // --- SonarJS: code smell and bug detection ---
    asConfig(sonarjsConfigs.recommended),
    {
      rules: asRules(SONARJS_RULES),
    },

    // --- Regexp: static analysis for regular expressions ---
    asConfig(pluginRegexp.configs['flat/recommended']),

    // --- Prettier: formatting drift is a hard error ---
    //
    // Mail-Meow's decision, adopted repo-wide because the alternative is
    // unenforceable: `pnpm run lint` is `eslint --fix --quiet` in three of the
    // four source repos, and `--quiet` discards every warning, so a
    // `prettier/prettier` *warning* is a silent no-op. 242 files were in that
    // state in Edge-Sonic: the gate had never run.
    asConfig(eslintConfigPrettier),
    {
      plugins: { prettier },
      rules: {
        'prettier/prettier': 'error',
      },
    },

    // --- Import direction guardrails (parameterized by scope) ---
    ...restrictedImports(bans),
    ...restrictedDynamicImports(bans),

    // --- Web: browser globals, matching the jsdom test environment ---
    //
    // The sources linted `apps/web` under `globals.node` only, so `window`,
    // `document` and `localStorage` read as undefined globals. The vitest web
    // config runs those suites under jsdom; the lint environment should agree
    // with the environment the code is executed in, or the rule is reporting
    // something untrue about how the file behaves.
    {
      files: ['apps/web/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
      languageOptions: {
        globals: { ...globals.node, ...globals.browser },
      },
    },

    // --- Test suite ---
    //
    // `test/**` is deliberately NOT in the ignores list above. See TEST_RULES
    // for the override block and the reasoning behind it.
    {
      files: ['test/**/*.{ts,tsx,mts,cts}', '**/*.test.{ts,tsx,mts,cts}', '**/*.spec.{ts,tsx,mts,cts}'],
      rules: asRules(TEST_RULES),
    },
  );
}
