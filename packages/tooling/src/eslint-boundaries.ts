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
 * Converged across all nine family repos: `provider-clients` (AWS-AccessBridge,
 * CalDAV-Bridge, Mail-Meow, Mail-Otter), `webdav`/`dav-store` (Durable-DAV,
 * Durable-DAV-Router, Edge-Sonic), `git-protocol`/`git-service` (Edge-Git).
 * `media-tags`/`subsonic` (Edge-Sonic) carry no boundary block in their source
 * repo — they are unconstrained utility leaves — so they have no layer here.
 *
 * The table is data rather than inline blocks so the dynamic-`import()` guard
 * is generated from the same list: a rule that derived its banned set from
 * another rule's configuration would be a second source of truth for the layer
 * table, and that table is what the docs describe.
 *
 * The table is a superset: a repo without a domain package simply never imports
 * it, so its ban never fires. A layer entry for a directory that does not exist
 * in the consumer matches no file and costs nothing.
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
  'packages/provider-clients',
  'packages/webdav',
  'packages/dav-store',
  'packages/git-protocol',
  'packages/git-service',
  'packages/backend-services',
  'apps/api',
  'apps/background',
  'apps/web',
];

/**
 * One layer's ban list, as the repo-relative package suffixes it may not import.
 *
 * Converged from all nine family repos. `backend-data` and `backend-services`
 * appear in all nine; `provider-clients` is AWS-AccessBridge's, CalDAV-Bridge's,
 * Mail-Meow's and Mail-Otter's; `webdav`/`dav-store` are Durable-DAV's,
 * Durable-DAV-Router's and Edge-Sonic's; `git-protocol`/`git-service` are
 * Edge-Git's. A layer only bans what exists in its repo, so the
 * union is safe: a repo without `provider-clients` simply never imports it.
 *
 * One `dir` may appear in several entries (see `apps/api` below): each entry
 * carries its own message and `allowTypeImports`, because the DAO ban allows
 * type-only imports and the direct-client bans do not.
 */
export interface LayerBan {
  /**
  Directory the rule is scoped to.
  */
  readonly dir: string;
  /**
  Package suffixes (relative to `scope`) that may not be imported from here.
  */
  readonly ban: readonly string[];
  /**
  Message shown when the rule fires.
  */
  readonly message: string;
  /**
  Type-only imports are allowed, for the DAO boundary in `apps/api`.
  */
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
      ban: [
        at('backend-data'),
        at('provider-clients'),
        at('webdav'),
        at('dav-store'),
        at('git-protocol'),
        at('git-service'),
        at('backend-services'),
        at('api'),
        at('background'),
      ],
      message: 'backend-runtime must not import from a higher layer',
    },
    {
      dir: 'packages/backend-data',
      ban: [
        at('backend-runtime'),
        at('provider-clients'),
        at('webdav'),
        at('dav-store'),
        at('git-protocol'),
        at('git-service'),
        at('backend-services'),
        at('api'),
        at('background'),
      ],
      message: 'backend-data must not import from a higher layer',
    },
    // Domain protocol layers (layer 2, beside backend-data): each bans the DAO
    // layer, the runtime, its store counterpart where it has one, the service
    // layer and the apps. Sources: provider-clients (AWS-AccessBridge,
    // Mail-Meow), webdav (Durable-DAV, Edge-Sonic), git-protocol (Edge-Git).
    {
      dir: 'packages/provider-clients',
      ban: [at('backend-data'), at('backend-runtime'), at('backend-services'), at('api'), at('background')],
      message: 'provider-clients must not import DAOs from backend-data',
    },
    {
      dir: 'packages/webdav',
      ban: [at('backend-data'), at('backend-runtime'), at('dav-store'), at('backend-services'), at('api'), at('background')],
      message: 'webdav must not import DAOs from backend-data',
    },
    {
      dir: 'packages/git-protocol',
      ban: [at('backend-data'), at('backend-runtime'), at('git-service'), at('backend-services'), at('api'), at('background')],
      message: 'git-protocol must not import DAOs from backend-data',
    },
    // Domain store layers (layer 2-3): only layers 0-2, never services or apps.
    // Sources: dav-store (Durable-DAV), git-service (Edge-Git).
    {
      dir: 'packages/dav-store',
      ban: [at('backend-services'), at('api'), at('background')],
      message: 'dav-store must not import from backend-services (higher layer)',
    },
    {
      dir: 'packages/git-service',
      ban: [at('backend-services'), at('api'), at('background')],
      message: 'git-service must not import from backend-services (higher layer)',
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
      message:
        'apps/api must not import DAOs or backend-data values directly; use backend-services instead (type-only imports are allowed)',
    },
    // Direct-client bans: one entry per client package so each message names
    // the correct alternative. A repo holds at most one of these packages, so
    // the other two never fire. Sources: provider-clients (AWS-AccessBridge,
    // Mail-Meow, Mail-Otter, CalDAV-Bridge), dav-store (Durable-DAV),
    // git-service (Edge-Git).
    {
      dir: 'apps/api',
      ban: [at('provider-clients')],
      message: `apps/api must not import provider-clients directly; use ${scope}/backend-services instead`,
    },
    {
      dir: 'apps/api',
      ban: [at('dav-store')],
      message: `apps/api must not import dav-store directly; use ${scope}/webdav + DO RPC via ${scope}/background instead`,
    },
    {
      dir: 'apps/api',
      ban: [at('git-service')],
      message: `apps/api must not import git-service directly; use ${scope}/git-protocol + DO RPC via ${scope}/background instead`,
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
 * The bans for one directory, in table order.
 *
 * **Grouping is load-bearing, not tidiness.** Flat config merges every matching
 * config object and resolves each rule name by *last entry wins* — so two
 * entries with the same `files` glob do not accumulate, the second replaces the
 * first's rule outright. Emitting one entry per `LayerBan` therefore meant that
 * a directory appearing twice in the table (`apps/api` does, four times) kept
 * only its last row: the DAO ban and the `provider-clients` ban vanished, and
 * the layer table in the kit's own documentation described a gate that was not
 * running. It could not be caught by asserting a rule exists for a dir — the
 * surviving rule exists — only by asserting every ban in the table survives.
 *
 * Merging happens at the **pattern** level rather than the layer level, because
 * the two things a layer carries are not mergeable: each group keeps its own
 * `message`, and `allowTypeImports` belongs to a group (`apps/api` may type its
 * filters against DAO shapes but may not reach `provider-clients` even as a
 * type). One config object per directory, every pattern inside it.
 */
function groupedByDir(bans: readonly LayerBan[]): Map<string, LayerBan[]> {
  const grouped = new Map<string, LayerBan[]>();
  for (const ban of bans) {
    const existing = grouped.get(ban.dir);
    if (existing) existing.push(ban);
    else grouped.set(ban.dir, [ban]);
  }
  return grouped;
}

/**
 * The `no-restricted-imports` entries, one per directory.
 *
 * Written as `group` patterns rather than exact `paths`, so `@myapp/backend-data`
 * and `@myapp/backend-data/dao` are both caught by one entry. `allowTypeImports`
 * is carried per group rather than per directory, because only the DAO boundary
 * sets it.
 */
export function restrictedImports(bans: readonly LayerBan[]): ConfigInput[] {
  return [...groupedByDir(bans)].map(([dir, layers]) => ({
    files: [`${dir}/**/*.{ts,js,mts,cts,mjs,cjs}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: layers.flatMap(({ ban, message, allowTypeImports }) =>
            ban.map((group) => ({
              group: [group, `${group}/*`],
              message,
              ...(allowTypeImports === true && { allowTypeImports: true }),
            })),
          ),
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
 * Grouped per directory for the same reason {@link restrictedImports} is: one
 * entry per layer would leave only the last row standing, and `no-restricted-syntax`
 * merges exactly like `no-restricted-imports` does.
 */
export function restrictedDynamicImports(bans: readonly LayerBan[]): ConfigInput[] {
  return [...groupedByDir(bans)].map(([dir, layers]) => ({
    files: [`${dir}/**/*.{ts,js,mts,cts,mjs,cjs}`],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...layers.flatMap(({ ban, message }) =>
          ban.map((specifier) => ({
            selector: `ImportExpression[source.type='Literal'][source.value=/^${specifier.replaceAll('/', String.raw`\/`)}/]`,
            message: `A dynamic import() is not covered by no-restricted-imports, so this layer reaches \`${specifier}\` through the one syntax that gate does not see. Both say no: ${message}`,
          })),
        ),
      ],
    },
  }));
}
