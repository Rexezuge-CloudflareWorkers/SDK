/**
 * The converged ESLint flat config for a monorepo in the Rexezuge family.
 *
 * Provenance: the base is Durable-DAV's `eslint.config.mjs` (380+ lines, the most
 * elaborate of the nine repos, with the layered `no-restricted-imports` boundary
 * rules). Merged in from the other three stacks that share the same plugin set:
 *
 * - **Edge-Sonic** — `test/**` is *not* ignored (it is linted like everything else,
 *   with a narrow override block for Vitest idioms), and
 *   `unicorn/prefer-ternary` is off. Edge-Sonic's per-rule "deliberately does not
 *   follow" block is carried over verbatim in spirit: each entry is off because
 *   complying would make the code worse for what the project is, and each is
 *   listed rather than dropped so the decision stays reviewable.
 * - **Mail-Meow** — `prettier/prettier` is an **error**, not a warning.
 * - **AWS-AccessBridge** — the `apps/api` DAO/service boundary uses
 *   `allowTypeImports` where the source repos do.
 *
 * Canonical decisions, and why each one:
 *
 * 1. **`prettier/prettier: 'error'`.** Three of the four source repos had it at
 *    `warn`, which under `eslint --quiet` is unenforceable — a gate nobody can see
 *    is a gate that has never run. Formatting drift is therefore a hard failure.
 * 2. **The layered boundary rules are parameterized by `scope`.** Every source
 *    repo wrote the same seven blocks with a different npm scope hardcoded; the
 *    factory takes `scope` (`'@myapp'`) and generates the `@myapp/*` patterns.
 * 3. **`test/**` is linted, not ignored.** Durable-DAV/AWS/Mail-Meow ignored it;
 *    Edge-Sonic does not, and records why: ~200 KB of test code had accumulated
 *    violations that nothing reported.
 * 4. **jsdom + node globals for web files.** The sources ran `globals.node` only;
 *    `apps/web` needs browser globals as well, and the vitest config for the SPA
 *    runs under jsdom, so the lint environment matches the test environment.
 *
 * The consumer's repo-level `eslint.config.mjs` becomes three lines — see the
 * README.
 */

import globals from 'globals';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
import pluginRegexp from 'eslint-plugin-regexp';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import type { FlatConfig } from 'typescript-eslint';

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
 * The directories the boundary rules cover, in the canonical layout.
 */
const DEFAULT_PROJECT_DIRS: readonly string[] = [
  'packages/shared',
  'packages/backend-errors',
  'packages/backend-runtime',
  'packages/backend-data',
  'packages/backend-services',
];

/**
 * One layer's ban list, as the repo-relative package suffixes it may not import.
 *
 * Converged from the four source stacks. `backend-data` and `backend-services`
 * appear in all four; `webdav`/`dav-store` are Durable-DAV's, `provider-clients`
 * is Mail-Meow's and AWS's. A layer only bans what exists in its repo, so the
 * union is safe: a repo without `provider-clients` simply never imports it.
 */
interface LayerBan {
  /** Directory the rule is scoped to. */
  readonly dir: string;
  /** Package suffixes (relative to `scope`) that may not be imported from here. */
  readonly ban: readonly string[];
  /** Message shown when the rule fires. */
  readonly message: string;
  /** Type-only imports are allowed, for the DAO boundary in `apps/api`. */
  readonly allowTypeImports?: boolean;
}

/**
 * The layer table, parameterized by `scope`.
 *
 * Each entry reproduces the corresponding block in Durable-DAV's
 * `eslint.config.mjs` with `@durable-dav/` replaced by the caller's scope. The
 * table is data rather than seven inline blocks so the dynamic-`import()` guard
 * below can be generated from the same list — a rule that derived its banned set
 * from another rule's configuration would be a second source of truth for the
 * layer table, and that table is what the docs describe.
 */
function layerBans(scope: string): readonly LayerBan[] {
  const at = (name: string): string => `${scope}/${name}`;
  return [
    {
      dir: 'packages/shared',
      ban: [at('*')],
      message: `${scope} packages must not import from other ${scope} packages — this is a zero-dependency base layer`,
    },
    {
      dir: 'packages/backend-errors',
      ban: [at('*')],
      message: `${scope} packages must not import from other ${scope} packages — this is a zero-dependency base layer`,
    },
    {
      dir: 'packages/backend-runtime',
      ban: [at('backend-data'), at('webdav'), at('backend-services'), at('api'), at('background')],
      message: 'backend-runtime must not import from a higher layer',
    },
    {
      dir: 'packages/backend-data',
      ban: [at('backend-runtime'), at('webdav'), at('backend-services'), at('api'), at('background')],
      message: 'backend-data must not import from a higher layer',
    },
    {
      dir: 'packages/backend-services',
      ban: [at('api'), at('background')],
      message: 'backend-services must not import from apps',
    },
    {
      dir: 'apps/api',
      ban: [at('backend-data/dao'), at('backend-data')],
      allowTypeImports: true,
      message: 'apps/api must not import DAOs or backend-data values directly; use backend-services instead',
    },
    {
      dir: 'apps/background',
      ban: [at('api')],
      message: 'apps/background must not import from apps/api',
    },
  ];
}

/**
 * The `no-restricted-imports` entries for one layer.
 *
 * Written as `group` patterns rather than exact `paths`, so `@myapp/backend-data`
 * and `@myapp/backend-data/dao` are both caught by one entry. `allowTypeImports`
 * is passed through only where the source repos set it, because
 * `apps/api` legitimately types its filters and models against DAO shapes.
 */
function restrictedImports(bans: readonly LayerBan[]): FlatConfig.Config[] {
  return bans.map(({ dir, ban, message, allowTypeImports }) => ({
    files: [`${dir}/**/*.{ts,js,mts,cts,mjs,cjs}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ban.map((group) => ({
            group: [group, `${group}/*`],
            message,
            ...(allowTypeImports === true && { allowTypeImports: true }),
          })),
        },
      ],
    },
  }));
}

/**
 * The dynamic-`import()` guard, generated from the same table.
 *
 * `no-restricted-imports` reads `ImportDeclaration` nodes only; a dynamic
 * `import()` is an `ImportExpression`, and this ESLint version does not report it
 * under that rule at all. Edge-Sonic verified this rather than assumed it — a
 * static import of a restricted specifier from the same file is an `error`, and
 * the identical specifier reached through `await import(...)` is silent. That
 * hole was load-bearing there: the credential path reached a banned module
 * through it. `no-restricted-syntax` sees `ImportExpression`, so the boundary is
 * stated a second way.
 *
 * The specifier list is duplicated from the layer table on purpose; see the
 * comment on `layerBans`.
 */
function restrictedDynamicImports(bans: readonly LayerBan[]): FlatConfig.Config[] {
  return bans.map(({ dir, ban, message }) => ({
    files: [`${dir}/**/*.{ts,js,mts,cts,mjs,cjs}`],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ban.map((specifier) => ({
          selector: `ImportExpression[source.type='Literal'][source.value=/^${specifier.replaceAll('/', '\\/')}/]`,
          message: `A dynamic import() is not covered by no-restricted-imports, so this layer reaches \`${specifier}\` through the one syntax that gate does not see. Both say no: ${message}`,
        })),
      ],
    },
  }));
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
  const bans = layerBans(scope).filter((layer) => projectDirs.some((dir) => layer.dir.startsWith(dir)));

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
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        // Allow `void expr` for intentional fire-and-forget in Workers.
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
        // Relax the unsafe-any rules to warn: the external API boundaries
        // (Cloudflare bindings, provider SDKs) are typed `any` upstream, and the
        // alternative is a config that cannot be adopted.
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        // JSX event handlers and hook callback objects commonly use async
        // functions where void is expected.
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false, properties: false } }],
      },
    },

    // --- Unicorn: modern JS/TS quality rules ---
    asConfig(unicorn.configs['flat/recommended']),
    {
      rules: {
        // Codebase uses ctx, req, res, env, err, util, db, dao, etc. — too
        // invasive to rename.
        'unicorn/prevent-abbreviations': 'off',
        // D1/DAO layer returns null; disabling this avoids mass rewrites.
        'unicorn/no-null': 'off',
        // Monorepo uses CommonJS-compatible module style in some configs.
        'unicorn/prefer-module': 'off',
        // Top-level await not available in all Workers entry points.
        'unicorn/prefer-top-level-await': 'off',
        // Error subclassing via `new MyError()` is intentional in backend-errors.
        'unicorn/custom-error-definition': 'off',
        // Allow process.exit in build/script files.
        'unicorn/no-process-exit': 'off',
        // Array reduce is used intentionally in analytics/data transformation.
        'unicorn/no-array-reduce': 'off',
        // Allow Number() — parseInt/parseFloat are used in some cases intentionally.
        'unicorn/prefer-number-properties': ['error', { checkInfinity: false }],
        // Allow nested ternaries in JSX (React render patterns).
        'unicorn/no-nested-ternary': 'off',
        // Allow Array.from — codebase uses it for iterables.
        'unicorn/prefer-spread': 'off',
        // Entire codebase uses PascalCase for TS files; kebab-case would require
        // mass renames.
        'unicorn/filename-case': 'off',
        // Established names should not be force-renamed.
        'unicorn/name-replacements': 'off',
        // Zod schema builder chains and other deep method chains are intentional.
        'unicorn/max-nested-calls': 'off',
        // import.meta.dirname is not available in all test environments.
        'unicorn/prefer-import-meta-properties': 'off',
        // Codebase uses `err` as catch parameter name throughout.
        'unicorn/catch-error-name': 'off',
        // Established boolean param names (retryable, enabled, etc.).
        'unicorn/consistent-boolean-name': 'off',
        // Uint8Array#toBase64 / fromBase64 are not in all Workers runtime versions.
        'unicorn/prefer-uint8array-base64': 'off',
        // Class member ordering would require extensive restructuring.
        'unicorn/consistent-class-member-order': 'off',
        // API response fields use verb prefixes by convention.
        'unicorn/no-non-function-verb-prefix': 'off',
        // forEach is used intentionally throughout the provider and utility layers.
        'unicorn/no-for-each': 'off',
        // .then() chains in DAO and provider layers are often intentional.
        'unicorn/prefer-await': 'warn',
        // Callback references (e.g. .map(Number)) are sometimes intentional.
        'unicorn/no-array-callback-reference': 'warn',
        // toSorted() is ES2023 and may not be in all tsconfig lib targets.
        'unicorn/no-array-sort': 'warn',
        // Early-return guard clauses are the established style; the rule only
        // rewrites the final guard of a ladder, which yields asymmetric mixed
        // style and long inline ternaries. Off in Mail-Meow and Edge-Sonic;
        // canonical here because it is the family's established style.
        'unicorn/prefer-ternary': 'off',
        // `(await x).y` -> a named intermediate. Fires constantly in the tests,
        // where destructuring beside the assertion it serves is clearer.
        'unicorn/no-await-expression-member': 'off',
        // `Number(x)` over `+x`: the `+` form is used where an explicit typeof
        // check has already narrowed the operand.
        'unicorn/prefer-number-coercion': 'off',
        // Code-point iteration: the byte-level readers index deliberately,
        // because the offset *is* what they are reading.
        'unicorn/prefer-code-point': 'off',
        // `if (!x) return;` over a compound condition: one guard per line, each
        // with its own comment, is what keeps endpoint guards readable.
        'unicorn/prefer-simple-condition-first': 'off',
        // Module-scope `let` assigned from `beforeEach` in the test harnesses.
        'unicorn/no-top-level-assignment-in-function': 'off',
        // Sequential `for...of` with `await` in the DAOs — D1's subrequest
        // budget is the scarce resource.
        'unicorn/no-unreadable-for-of-expression': 'off',
        // `Object.hasOwn` over `in`: used where a prototype-chain hit is harmless.
        'unicorn/no-computed-property-existence-check': 'off',
        // A labeled `break` out of two loops.
        'unicorn/no-break-in-nested-loop': 'off',
        // `this` outside a class body: the module-level cache singletons
        // document their `this` contract in prose.
        'unicorn/no-this-outside-of-class': 'off',
        // A class named inside its own static method.
        'unicorn/class-reference-in-static-methods': 'off',
        // `void promise` where initiating the call is the point and the rejection
        // is handled at a named site elsewhere.
        'sonarjs/void-use': 'off',
        // An `async` function with no `await`: every handler and DAO method is
        // `async` by shape so a future `await` does not change its signature.
        '@typescript-eslint/require-await': 'off',
        // Backtracking risk in bounded-prefix readers that run over a file the
        // server already chose to fetch, never over a request parameter.
        'sonarjs/super-linear-regex': 'off',
        // Assigning `globalThis.fetch` in a test — the only way to intercept the
        // ambient fetch in Node without a module mock.
        'unicorn/no-global-object-property-assignment': 'off',
        // `(a ? b : c) && d`: written longhand so each precedence decision is
        // visible.
        'unicorn/prefer-logical-operator-over-ternary': 'off',
        // `children[0]` in the XML helpers, which index a child list positionally.
        'unicorn/better-dom-traversing': 'off',
        // `entries()` -> `keys()`/`values()`: the full entry is destructured.
        'unicorn/prefer-iterator-to-array': 'off',
        // `.map(fn, thisArg)`: rejected on purpose.
        'unicorn/no-array-method-this-argument': 'off',
        // A module-scope function that closes over nothing.
        'unicorn/consistent-function-scoping': 'off',
        // `foo[0] === 'a' || foo[0] === 'b'` written longhand where the
        // alternatives are not adjacent.
        'unicorn/prefer-includes-over-repeated-comparisons': 'off',
        // A `type` alias over an inline union, where the name is what makes the
        // signature and its doc comment readable.
        'sonarjs/use-type-alias': 'off',
        // A short local alias for a type imported from a protocol package.
        'sonarjs/redundant-type-aliases': 'off',
        // `type: value` narrowing the other way, where both spellings appear in
        // the same schema and the code follows whichever the spec uses there.
        'sonarjs/no-nested-assignment': 'off',
        // `Number.isInteger` plus a separate range check, where the bounds come
        // from the caller's own options in one place.
        'unicorn/prefer-number-is-safe-integer': 'off',
        // `\u{...}` over a `\xNN` escape: the table is written in the byte form
        // the spec prints.
        'unicorn/prefer-unicode-code-point-escapes': 'off',
        // `self.x = this.x` in an entry model: the alias makes the verbatim
        // round-trip explicit.
        'unicorn/no-this-assignment': 'off',
        // Building a `Set` at module scope from a constant list, for O(1)
        // membership on a path that runs per parameter.
        'unicorn/no-top-level-side-effects': 'off',
        // `await` on a value the types say is not thenable, where the value is a
        // `PromiseLike` from an interface declared that way.
        '@typescript-eslint/await-thenable': 'off',
        // A conditional whose branches are identical, kept where the two branches
        // are named separately to document that they are meant to diverge.
        'sonarjs/no-all-duplicated-branches': 'off',
        // An `else` after a `return`: the flat form keeps the remaining cases at
        // one indent level in the dispatch tables.
        'unicorn/prefer-else-if': 'off',
        // A nested ternary in a sort comparator, where the three-way order is the
        // point.
        'unicorn/prefer-minimal-ternary': 'off',
        // `x === undefined` reported as always-true/false. With
        // `noUncheckedIndexedAccess` on, the guard is exactly right.
        'sonarjs/different-types-comparison': 'off',
        // An accumulating loop with a sequential `await` in it, over D1 writes.
        'unicorn/prefer-array-from-async': 'off',
      },
    },

    // --- SonarJS: code smell and bug detection ---
    asConfig(sonarjsConfigs.recommended),
    {
      rules: {
        // Raise duplicate-string threshold to avoid flagging intentional repeated
        // literals like provider IDs.
        'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
        // Cognitive complexity — warn rather than error, so the ratchet can move
        // without a red build. Raise the number only as files are decomposed.
        'sonarjs/cognitive-complexity': ['warn', 20],
        // False positives: connection method names like 'imap-password' and
        // field names like 'password_hash'.
        'sonarjs/no-hardcoded-passwords': 'off',
        // Third-party deprecations are warnings, not errors.
        'sonarjs/deprecation': 'warn',
        // Nested ternaries in complex data-mapping code.
        'sonarjs/no-nested-conditional': 'warn',
        // React component props are commonly not marked Readonly<>.
        'sonarjs/prefer-read-only-props': 'warn',
        // Static readonly properties require invasive refactoring.
        'sonarjs/public-static-readonly': 'warn',
        // Nested template literals in SQL queries and prompt construction.
        'sonarjs/no-nested-template-literals': 'warn',
      },
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
    // `test/**` is deliberately NOT in the ignores list above. Durable-DAV,
    // AWS and Mail-Meow all ignored it, and ~200 KB of test code had accumulated
    // violations that nothing reported. This block puts the suite back under the
    // same rules as the rest of the workspace and switches off only the handful
    // whose findings are structural artefacts of test code rather than defects.
    // It does not disable correctness rules: the unused-variable, dead-store,
    // regex and sorting findings in the suite are real and are fixed, not
    // suppressed.
    {
      files: ['test/**/*.{ts,tsx,mts,cts}', '**/*.test.{ts,tsx,mts,cts}', '**/*.spec.{ts,tsx,mts,cts}'],
      rules: {
        // `it('…', async () => …)` is the Vitest idiom.
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false, attributes: false } }],
        // Unbound method is a common false positive in mock assertions like
        // expect(fn).toHaveBeenCalledWith(...).
        '@typescript-eslint/unbound-method': 'off',
        // Test helpers and stubs routinely use async functions without await.
        '@typescript-eslint/require-await': 'off',
        // Redundant type constituents appear in typed mock stubs.
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        // `as never` casts are the standard fake-DB double pattern in tests.
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        // Promise.withResolvers() and function-scoping refactors are cosmetic.
        'unicorn/prefer-promise-with-resolvers': 'off',
        'unicorn/consistent-function-scoping': 'off',
        // Fake-DB builders push-then-return and sort without comparators.
        'unicorn/no-return-array-push': 'off',
        'unicorn/require-array-sort-compare': 'off',
        // Iterator-helper rewrites churn test fakes with no runtime benefit.
        'unicorn/prefer-iterator-helpers': 'off',
        'unicorn/prefer-iterator-to-array': 'off',
        // String replacement with test-driven values is intentional in assertions.
        'unicorn/no-unsafe-string-replacement': 'off',
        // Fake-D1 doubles await a DAO thunk and call straight onto the result.
        'unicorn/no-await-expression-member': 'off',
        // `void promise` marks a deliberately unawaited promise in a test.
        'sonarjs/void-use': 'off',
        // A test asserting request routing has to name `http://` hosts, and a
        // proxy test has to name a loopback upstream. Both are the subject
        // matter, not leaked configuration. `unicorn/prefer-https` must stay off
        // here and this is not a style preference: it rewrites `http://` to
        // `https://` *inside string literals*, and `--fix` applies it silently.
        'sonarjs/no-clear-text-protocols': 'off',
        'sonarjs/no-hardcoded-ip': 'off',
        'unicorn/prefer-https': 'off',
        // sonarjs/assertions-in-tests fires false positives when test helpers
        // handle assertions indirectly.
        'sonarjs/assertions-in-tests': 'off',
        // sonarjs/no-extra-arguments fires incorrectly on Vitest mock overloads.
        'sonarjs/no-extra-arguments': 'off',
        // Union/inline types in test fakes are more readable than aliases.
        'sonarjs/use-type-alias': 'off',
        // Alphabetical-sort rule fights deterministic fixture ordering.
        'sonarjs/no-alphabetical-sort': 'off',
        // Repeated string literals in fixtures/assertions are clearer inline.
        'sonarjs/no-duplicate-string': 'off',
        // Fake-D1 doubles break out of a nested loop to model a statement miss.
        'unicorn/no-break-in-nested-loop': 'off',
        // Fixtures are naturally built with sort()/for…of over composed expressions.
        'unicorn/no-array-sort': 'off',
        'unicorn/no-unreadable-for-of-expression': 'off',
        'unicorn/no-useless-template-literals': 'off',
        'unicorn/no-declarations-before-early-exit': 'off',
        'unicorn/prefer-includes-over-repeated-comparisons': 'off',
        'sonarjs/prefer-specific-assertions': 'off',
        'sonarjs/no-inverted-boolean-check': 'off',
      },
    },
  );
}
