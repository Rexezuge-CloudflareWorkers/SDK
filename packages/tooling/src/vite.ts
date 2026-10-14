/**
 * The SPA's Vite config.
 *
 * Provenance: converged from the `apps/web/vite.config.ts` of the eight repos
 * that build a Vite SPA. They are one file with three variables: the plugin list
 * (`@vitejs/plugin-react` + `@tailwindcss/vite`), the dev-server proxy target,
 * and the `spa-shell-embed` plugin that copies `dist/index.html` into
 * `apps/api/src/generated/spa-shell.ts`.
 *
 * Canonical decisions:
 *
 * 1. **The plugins are passed in, not imported.** The kit stays zero-dependency:
 *   `react`, `@vitejs/plugin-react` and `@tailwindcss/vite` belong to the app
 *   that uses them, and importing them here would make the tooling package
 *   undownloadable for a consumer without a React SPA.
 * 2. **The `spa-shell-embed` hook stays per-repo, and is passed in.** It is the
 *   one genuinely repo-specific piece: each repo names its own worker and its
 *   own generated-module path. What the kit provides is the *contract* — see
 *   `spaShellEmbedPlugin`, which is the converged body of all eight copies.
 * 3. **`server.proxy` is data, not code.** The paths differ per repo
 *   (`/user` + `/rest` in Edge-Sonic, `/api` in CalDAV-Bridge, `/tracker` in
 *   ChordDHT-Tracker) but the shape never does, so it is an option with a
 *   default.
 * 4. **`build.emptyOutDir: true`** is the default, because a stale asset in
 *   `dist/` is served as a live bundle — the same half-refreshed build
 *   `scripts/verify-spa-shell.ts` rejects.
 *
 * The consumer's `apps/web/vite.config.ts` becomes a handful of lines — see the
 * README.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin, type ViteUserConfig } from 'vitest/config';

/**
 * One dev-server proxy entry, as Vite's `server.proxy` accepts it.
 */
export interface ProxyEntry {
  readonly target: string;
  readonly changeOrigin?: boolean;
  readonly bypass?: (request: { headers: Record<string, string | string[] | undefined> }) => string | undefined;
}

/**
 * Where the SPA's built `index.html` is copied to, and under what module name.
 */
export interface SpaShellTarget {
  /**
   * Path of the generated module, relative to the repository root.
   *
   * `apps/api/src/generated/spa-shell.ts` in every repo that embeds a shell; the
   * parameter exists because the path is the one thing that genuinely differs.
   */
  readonly path: string;
  /**
   * The repository root the path is resolved against, as a file URL or a path.
   *
   * Defaults to the directory the build runs in (`process.cwd()`), which is the
   * repo root when the build is `pnpm --filter @scope/web build`. Passed in by the
   * Vite config, not derived from `import.meta.url`: this plugin object is created
   * inside the kit's own module, so a URL relative to it points into
   * `node_modules/@rexezuge/tooling` and writes the shell somewhere no compiler
   * will ever look.
   */
  readonly root?: string | URL;
  /**
   * The built `index.html`, as a path or file URL.
   *
   * Defaults to `dist/index.html` under the same root. Vite's `closeBundle` runs
   * after the bundle is written, so this is the file the build just produced.
   */
  readonly distIndex?: string | URL;
}

/**
 * What `defineWebViteConfig` accepts.
 */
export interface WebViteConfigOptions {
  /**
   * The SPA's plugins — `react()`, `tailwindcss()`, and anything else the app
   * needs. Applied before the spa-shell plugin so the shell is written after the
   * bundle exists.
   */
  readonly plugins?: readonly Plugin[];
  /**
   * Dev-server proxy entries. Keyed by path prefix.
   */
  readonly proxy?: Readonly<Record<string, ProxyEntry>>;
  /**
   * Where the built shell is embedded. Omit to skip the embedding entirely.
   */
  readonly spaShell?: SpaShellTarget;
  /**
   * The build output directory.
   */
  readonly outDir?: string;
  /**
   * The directory this config is resolved from, as a file URL. Defaults to the
   * caller's location.
   */
  readonly root?: string;
}

/**
 * The `spa-shell-embed` plugin, converged from all eight copies.
 *
 * It exists because the API worker serves `SPA_HTML` from a module in its own
 * source tree, and both that module and `dist/` are gitignored — so a fresh
 * clone gets an empty stub from `postinstall` and every `GET /` returns a blank
 * page until someone runs a build. This plugin is what makes the build write the
 * real artefact, and `scripts/verify-spa-shell.ts` is what refuses to deploy
 * without it.
 *
 * Written as a factory rather than inlined so the exit conditions are in one
 * place: the `closeBundle` hook runs on every build, including the ones where
 * `dist/index.html` was never produced, and a plugin that throws there fails
 * builds that legitimately emit nothing.
 */
/**
 * Normalise a path-or-URL option to a URL, so `new URL(...)` can be used on it.
 *
 * Small, and here because two options accept either form: a path is what a consumer
 * naturally writes in a config, and a URL is what `import.meta.url` hands them.
 * Accepting both is one line and saves a `fileURLToPath` at every call site.
 */
/**
 * Normalise `string | URL` to a `URL`.
 *
 * A string that is **already a file URL** must be parsed, not converted:
 * `pathToFileURL('file:///srv/app')` treats its argument as a filesystem path
 * and produces `file:///<cwd>/file:/srv/app`, so every path built on top of it
 * silently resolves into a directory named after the scheme.
 *
 * The failure this prevented is not loud. `spaShellEmbedPlugin` then reports
 * "dist/index.html not found, skipping" — which is also what a genuinely fresh
 * checkout prints on its first build — and the consumer's worker keeps serving
 * the *previous* shell, so the SPA ships yesterday's JavaScript with no error
 * anywhere in the build log. Both `root` and `distIndex` are documented as
 * "a file URL or a path", and `new URL('.', import.meta.url).href` — the shape
 * every config file reaches for first — is a file-URL string, so this is the
 * path most callers take.
 */
function toUrl(value: string | URL): URL {
  if (value instanceof URL) return value;
  return value.startsWith('file:') ? new URL(value) : pathToFileURL(value);
}

/**
 * The same, as a **directory** URL — with the trailing separator `new URL(rel, base)`
 * needs.
 *
 * `new URL('apps/api/x.ts', 'file:///repo')` resolves to `/apps/api/x.ts`, silently
 * dropping the base. The base has to end in a separator, and a path from
 * `process.cwd()` never does, so this is where the plugin would otherwise write the
 * shell into the filesystem root.
 */
function toDirUrl(value: string | URL): URL {
  const url = toUrl(value);
  return url.href.endsWith('/') ? url : new URL(`${url.href}/`);
}

export function spaShellEmbedPlugin(target: SpaShellTarget): Plugin & { closeBundle: () => void } {
  return {
    name: 'spa-shell-embed',
    closeBundle() {
      // Resolved from the directory the build runs in, never from this module's own
      // URL: the plugin object is created here but executes in the consumer's Vite
      // process, and `new URL(path, import.meta.url)` would resolve against
      // `node_modules/@rexezuge/tooling`. `process.cwd()` is the repo root for
      // `pnpm --filter @scope/web build`, which is how every consumer runs it.
      const root = toDirUrl(target.root ?? process.cwd());
      const outputPath = fileURLToPath(new URL(target.path, root));
      const indexPath =
        target.distIndex === undefined ? fileURLToPath(new URL('dist/index.html', root)) : fileURLToPath(toUrl(target.distIndex));

      if (!existsSync(indexPath)) {
        console.warn('spa-shell-embed: dist/index.html not found, skipping');
        return;
      }

      const html = readFileSync(indexPath, 'utf8');
      const output = `// Auto-generated by Vite build plugin - DO NOT EDIT.\nexport const SPA_HTML: string = ${JSON.stringify(html)};\n`;

      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);
    },
  };
}

/**
 * Build the SPA's Vite config.
 *
 * ```ts
 * // apps/web/vite.config.ts
 * import react from '@vitejs/plugin-react';
 * import { defineWebViteConfig, spaShellEmbedPlugin } from '@rexezuge/tooling/vite';
 *
 * export default defineWebViteConfig({
 *   plugins: [react()],
 *   proxy: { '/user': { target: 'http://localhost:8787', changeOrigin: true } },
 *   spaShell: { path: '../../apps/api/src/generated/spa-shell.ts' },
 * });
 * ```
 */
export function defineWebViteConfig(options: WebViteConfigOptions = {}): ViteUserConfig {
  const plugins: Plugin[] = [...(options.plugins ?? [])];
  if (options.spaShell !== undefined) {
    plugins.push(spaShellEmbedPlugin(options.spaShell));
  }

  return defineConfig({
    ...(plugins.length > 0 && { plugins }),
    ...(options.proxy !== undefined && { server: { proxy: { ...options.proxy } } }),
    build: {
      outDir: options.outDir ?? 'dist',
      emptyOutDir: true,
    },
  });
}
