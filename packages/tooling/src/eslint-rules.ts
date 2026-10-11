/**
 * The rule-override blocks of the repo lint config.
 *
 * Extracted from `eslint.ts` with the boundary rules: each block is a plain
 * rules object with the provenance comment that says *why* it is set to this
 * value, because a per-rule decision with no reason attached is a decision the
 * next reader re-litigates. `eslint.ts` composes these; this file is where a
 * rule's story lives.
 */

/**
 * TypeScript rules, identical in all four source stacks.
 */
export const TYPESCRIPT_RULES: Readonly<Record<string, unknown>> = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  // Allow `void expr` for intentional fire-and-forget in Workers.
  '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
  // Relax the unsafe-any rules to warn: the external API boundaries (Cloudflare
  // bindings, provider SDKs) are typed `any` upstream, and the alternative is a
  // config that cannot be adopted.
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  // JSX event handlers and hook callback objects commonly use async functions
  // where void is expected.
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false, properties: false } }],
  // An `async` function with no `await`: every handler and DAO method is
  // `async` by shape so a future `await` does not change its signature.
  '@typescript-eslint/require-await': 'off',
  // `await` on a value the types say is not thenable, where the value is a
  // `PromiseLike` from an interface declared that way.
  '@typescript-eslint/await-thenable': 'off',
};

/**
 * Unicorn and SonarJS rules carried from the source repos, each off for a
 * stated reason.
 *
 * This is the family's "deliberately does not follow" block: every entry is
 * off because complying would make the code worse for what the project is,
 * and each is listed rather than dropped so the decision stays reviewable.
 */
export const UNICORN_RULES: Readonly<Record<string, unknown>> = {
  // Codebase uses ctx, req, res, env, err, util, db, dao, etc. — too invasive
  // to rename.
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
  // rewrites the final guard of a ladder, which yields asymmetric mixed style
  // and long inline ternaries. Off in Mail-Meow and Edge-Sonic; canonical here
  // because it is the family's established style.
  'unicorn/prefer-ternary': 'off',
  // `(await x).y` -> a named intermediate. Fires constantly in the tests,
  // where destructuring beside the assertion it serves is clearer.
  'unicorn/no-await-expression-member': 'off',
  // `Number(x)` over `+x`: the `+` form is used where an explicit typeof check
  // has already narrowed the operand.
  'unicorn/prefer-number-coercion': 'off',
  // Code-point iteration: the byte-level readers index deliberately, because
  // the offset *is* what they are reading.
  'unicorn/prefer-code-point': 'off',
  // `if (!x) return;` over a compound condition: one guard per line, each with
  // its own comment, is what keeps endpoint guards readable.
  'unicorn/prefer-simple-condition-first': 'off',
  // Module-scope `let` assigned from `beforeEach` in the test harnesses.
  'unicorn/no-top-level-assignment-in-function': 'off',
  // Sequential `for...of` with `await` in the DAOs — D1's subrequest budget is
  // the scarce resource.
  'unicorn/no-unreadable-for-of-expression': 'off',
  // `Object.hasOwn` over `in`: used where a prototype-chain hit is harmless.
  'unicorn/no-computed-property-existence-check': 'off',
  // A labeled `break` out of two loops.
  'unicorn/no-break-in-nested-loop': 'off',
  // `this` outside a class body: the module-level cache singletons document
  // their `this` contract in prose.
  'unicorn/no-this-outside-of-class': 'off',
  // A class named inside its own static method.
  'unicorn/class-reference-in-static-methods': 'off',
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
  // `type: value` narrowing the other way, where both spellings appear in the
  // same schema and the code follows whichever the spec uses there.
  'sonarjs/no-nested-assignment': 'off',
  // `Number.isInteger` plus a separate range check, where the bounds come from
  // the caller's own options in one place.
  'unicorn/prefer-number-is-safe-integer': 'off',
  // `\u{...}` over a `\xNN` escape: the table is written in the byte form the
  // spec prints.
  'unicorn/prefer-unicode-code-point-escapes': 'off',
  // `self.x = this.x` in an entry model: the alias makes the verbatim
  // round-trip explicit.
  'unicorn/no-this-assignment': 'off',
  // Building a `Set` at module scope from a constant list, for O(1) membership
  // on a path that runs per parameter.
  'unicorn/no-top-level-side-effects': 'off',
  // A conditional whose branches are identical, kept where the two branches
  // are named separately to document that they are meant to diverge.
  'sonarjs/no-all-duplicated-branches': 'off',
  // An `else` after a `return`: the flat form keeps the remaining cases at one
  // indent level in the dispatch tables.
  'unicorn/prefer-else-if': 'off',
  // A nested ternary in a sort comparator, where the three-way order is the
  // point.
  'unicorn/prefer-minimal-ternary': 'off',
  // `void promise` where initiating the call is the point and the rejection is
  // handled at a named site elsewhere.
  'sonarjs/void-use': 'off',
  // `x === undefined` reported as always-true/false. With
  // `noUncheckedIndexedAccess` on, the guard is exactly right.
  'sonarjs/different-types-comparison': 'off',
  // An accumulating loop with a sequential `await` in it, over D1 writes.
  'unicorn/prefer-array-from-async': 'off',
};

/**
 * SonarJS rules the sources turned from errors into advisories, with the
 * threshold raised to a value that has actually held.
 */
export const SONARJS_RULES: Readonly<Record<string, unknown>> = {
  // Raise duplicate-string threshold to avoid flagging intentional repeated
  // literals like provider IDs.
  'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
  // Cognitive complexity — warn rather than error, so the ratchet can move
  // without a red build. Raise the number only as files are decomposed.
  'sonarjs/cognitive-complexity': ['warn', 20],
  // False positives: connection method names like 'imap-password' and field
  // names like 'password_hash'.
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
};

/**
 * Test-suite overrides.
 *
 * `test/**` is deliberately *not* in the config's ignores list. Durable-DAV,
 * AWS and Mail-Meow all ignored it, and ~200 KB of test code had accumulated
 * violations that nothing reported. This block puts the suite back under the
 * same rules as the rest of the workspace and switches off only the handful
 * whose findings are structural artefacts of test code rather than defects.
 * It does not disable correctness rules: the unused-variable, dead-store,
 * regex and sorting findings in the suite are real and are fixed, not
 * suppressed.
 */
export const TEST_RULES: Readonly<Record<string, unknown>> = {
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
  // A test asserting request routing has to name `http://` hosts, and a proxy
  // test has to name a loopback upstream. Both are the subject matter, not
  // leaked configuration. `unicorn/prefer-https` must stay off here and this
  // is not a style preference: it rewrites `http://` to `https://` *inside
  // string literals*, and `--fix` applies it silently.
  'sonarjs/no-clear-text-protocols': 'off',
  'sonarjs/no-hardcoded-ip': 'off',
  'unicorn/prefer-https': 'off',
  // sonarjs/assertions-in-tests fires false positives when test helpers handle
  // assertions indirectly.
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
};
