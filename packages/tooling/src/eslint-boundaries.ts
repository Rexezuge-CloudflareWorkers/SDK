import type tseslint from 'typescript-eslint';

/**
 * The layer table behind the repo lint config's import boundaries.
 *
 * Provenance: the seven `no-restricted-imports` blocks in Durable-DAV's
 * `eslint.config.mjs`, with `@durable-dav/` replaced by the caller's scope.
 * Extracted from `eslint.ts` so the boundary rules — the part a repo actually
 * argues about — are their own module rather than the tail of a 640-line
 * config file.
 *
 * The table is data rather than inline blocks so the dynamic-`import()` guard
 * is generated from the same list: a rule that derived its banned set from
 * another rule's configuration would be a second source of truth for the layer
 * table, and that table is what the docs describe.
 */

/**
 * The directories the boundary rules cover, in the canonical layout.
 *
 * Kept here, beside the table it scopes: `defineRepoLintConfig` filters the
 * canonical layers by `projectDirs`, and a reader of the layer table should not
 * have to open the config assembly to learn which directories it covers.
 */
export const DEFAULT_PROJECT_DIRS: readonly string[] = [
  'packages/shared',
  'packages/backend-errors',
  'packages/backend-runtime',
  'packages/backend-data',
  'packages/backend-services',
  'apps/api',
  'apps/background',
  'apps/web',
];

/**
 * One layer's ban list, as the repo-relative package suffixes it may not import.
 *
 * Converged from the four source stacks. `backend-data` and `backend-services`
 * appear in all four; `webdav`/`dav-store` are Durable-DAV's, `provider-clients`
 * is Mail-Meow's and AWS's. A layer only bans what exists in its repo, so the
 * union is safe: a repo without `provider-clients` simply never imports it.
 */
export interface LayerBan {
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
 */
export function layerBans(scope: string): readonly LayerBan[] {
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
    // The browser half, and the only layer that bans the namespace wholesale
    // rather than a list of siblings: a backend package imported by the SPA
    // typechecks and then fails at bundle time, with the error pointing at the
    // bundler rather than at the boundary. Edge-Sonic is the source; the others had
    // no block for it at all, which is how their layer table's "may import: the
    // browser" was a convention instead of a gate.
    {
      dir: 'apps/web',
      ban: [at('*')],
      message: `${at('apps/web')} ships zero backend dependencies — this module is the SPA's own copy`,
    },
  ];
}

/**
 * One argument to `tseslint.config()`, named here so the boundary builders
 * return the assembled type rather than a lookalike the assembly then has to
 * be argued into accepting.
 */
type ConfigInput = Parameters<typeof tseslint.config>[number];

/**
 * The `no-restricted-imports` entries for one layer.
 *
 * Written as `group` patterns rather than exact `paths`, so `@myapp/backend-data`
 * and `@myapp/backend-data/dao` are both caught by one entry. `allowTypeImports`
 * is passed through only where the source repos set it, because `apps/api`
 * legitimately types its filters and models against DAO shapes.
 */
export function restrictedImports(bans: readonly LayerBan[]): ConfigInput[] {
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
 */
export function restrictedDynamicImports(bans: readonly LayerBan[]): ConfigInput[] {
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
