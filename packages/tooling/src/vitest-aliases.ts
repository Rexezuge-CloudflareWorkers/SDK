import { fileURLToPath } from 'node:url';

/**
 * One `{ find, replacement }` pair for Vitest's resolver.
 *
 * A `string` find is a prefix match in Vite; a `RegExp` find is tested against
 * the specifier. Workspace scopes use plain strings (`'@scope/name'` matches
 * `'@scope/name'` and `'@scope/name/sub'` alike); `@/` and `~/` use regexps so
 * the trailing slash is part of the match.
 */
export interface VitestAlias {
  readonly find: string | RegExp;
  readonly replacement: string;
}

/**
 * Every workspace package the family has converged on, as directory names under
 * `packages/`.
 *
 * The union across all nine repos: the universal core (`shared`,
 * `backend-errors`, `backend-runtime`, `backend-data`, `backend-services`) plus
 * the domain packages (`provider-clients`, `webdav`, `dav-store`,
 * `git-protocol`, `git-service`). `media-tags`/`subsonic` (Edge-Sonic) are
 * unconstrained utility leaves with no boundary block and no alias in their
 * source repo, so they are not listed — a repo that needs them passes
 * `packages` explicitly or appends `aliases`.
 *
 * A superset is safe: an alias for a package the consumer does not have never
 * matches a specifier, and Vite only resolves the replacement when something
 * imports it.
 */
export const DEFAULT_WORKSPACE_PACKAGES: readonly string[] = [
  'shared',
  'backend-errors',
  'backend-runtime',
  'backend-data',
  'provider-clients',
  'webdav',
  'dav-store',
  'git-protocol',
  'git-service',
  'backend-services',
  'background',
];

/**
 * The Cloudflare runtime mocks the unit suite aliases.
 *
 * `workers` exists in every repo; `sockets` in five; `workflows` in four. All
 * three are listed by default: an alias whose mock file is absent never fires
 * unless a test imports the specifier, and then the missing file is the correct
 * error rather than Node's `ERR_UNKNOWN_SCHEME` for `cloudflare:*`.
 */
export const DEFAULT_CLOUDFLARE_MOCKS: readonly string[] = ['workers', 'sockets', 'workflows'];

/**
 * Keep the kit's own `dist/` inside Vite's pipeline.
 *
 * The kit ships ESM `dist/` with bundler-style extensionless relative imports
 * (its tsconfig is `moduleResolution: Bundler`), which Node's ESM resolver
 * refuses. Vitest externalizes `node_modules` deps by default and would import
 * that dist with Node; `noExternal` routes `@rexezuge/*` back through Vite —
 * the same resolver that bundles the worker — so a test loads the very dist
 * the worker ships. Without this, the run dies on `./BaseDAO` inside
 * `@rexezuge/d1`'s `dist/index.js`.
 */
export const KIT_NO_EXTERNAL: readonly RegExp[] = [/(^|[/\\])@rexezuge\//];

/**
 * Bare specifiers the kit and its consumer must resolve to **one** copy.
 *
 * Every entry is a peer of a kit package rather than a dependency, which is
 * exactly why it is needed: a peer is not installed twice under a registry
 * install, so the two sides already agree. A `link:` install breaks that
 * agreement — the symlinked package directory carries its own `node_modules`, and
 * with `@rexezuge/*` inlined into Vite's pipeline (see {@link KIT_NO_EXTERNAL})
 * the kit's copy wins for its own imports while the consumer's wins for the app's.
 *
 * Two Reacts is not a warning: `useState` is read off a module-level hook
 * dispatcher that only one of them initialises, so every hook inside a kit
 * component throws `Cannot read properties of null (reading 'useState')`. The
 * failure names the kit, and the cause is the install layout.
 */
export const KIT_DEDUPE: readonly string[] = ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'];

/**
 * What `workspaceAliases` accepts.
 */
export interface WorkspaceAliasesOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`. Every `@scope/*` alias is
   * derived from it, so the same factory serves all nine repos.
   */
  readonly scope: string;
  /**
   * The repo root, as a file URL. Pass `new URL('.', import.meta.url).href`
   * from the calling config — never `import.meta.url` of this module, which
   * points inside `node_modules/@rexezuge/tooling`.
   */
  readonly root: string;
  /**
   * Workspace package directory names under `packages/` plus `background`
   * (which lives under `apps/`). Defaults to {@link DEFAULT_WORKSPACE_PACKAGES}.
   */
  readonly packages?: readonly string[];
  /**
   * Which `cloudflare:*` mocks to alias. Defaults to {@link DEFAULT_CLOUDFLARE_MOCKS}.
   */
  readonly mocks?: readonly string[];
  /**
   * Extra resolver entries, applied after the canonical ones.
   */
  readonly extraAliases?: readonly VitestAlias[];
}

/**
 * Build the workspace alias table for a consumer repo.
 *
 * Aliases point at source rather than at built output, so a test exercises the
 * code the worker would run without a build step. `background` resolves under
 * `apps/`; every other package under `packages/`. `@/` maps to the API worker
 * source and `~/` to the SPA source, matching the two `tsconfig` path prefixes
 * every repo shares.
 */
export function workspaceAliases(options: WorkspaceAliasesOptions): VitestAlias[] {
  const { scope, root } = options;
  const packages = options.packages ?? DEFAULT_WORKSPACE_PACKAGES;
  const mocks = options.mocks ?? DEFAULT_CLOUDFLARE_MOCKS;
  const at = (relative: string): string => fileURLToPath(new URL(relative, root));
  const aliases: VitestAlias[] = [];
  for (const name of packages) {
    const dir = name === 'background' ? 'apps/background/src' : `packages/${name}/src`;
    aliases.push({ find: `${scope}/${name}`, replacement: at(dir) });
  }
  for (const mock of mocks) {
    aliases.push({ find: `cloudflare:${mock}`, replacement: at(`test/mocks/cloudflare-${mock}.ts`) });
  }
  const apiSrc = at('apps/api/src');
  const webSrc = at('apps/web/src');
  aliases.push({ find: /^@\//, replacement: `${apiSrc}/` }, { find: /^~\//, replacement: `${webSrc}/` }, ...(options.extraAliases ?? []));
  return aliases;
}
