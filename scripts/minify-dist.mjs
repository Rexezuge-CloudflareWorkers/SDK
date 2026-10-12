#!/usr/bin/env node
/**
 * Minify the `tsc`-emitted `dist/` of one SDK package with esbuild.
 *
 * Each package builds with `tsc -p tsconfig.json` (types, declarations and
 * readable JS) and then runs this over the output, so the published `dist`
 * is what a size-constrained Workers bundle wants to consume. Only `*.js`
 * files are rewritten in place; `*.d.ts`, `*.d.ts.map` and the existing
 * `*.js.map` layout are kept, with the maps regenerated against the
 * minified output (their sources are the unminified `tsc` JS).
 *
 * Run from the package directory — this is how `pnpm -r build` invokes it:
 *
 * ```sh
 * node ../../scripts/minify-dist.mjs [package-dir]
 * ```
 *
 * With no argument the current working directory is the package.
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';

/**
 * Every `*.js` file under `dir`, deepest first so a later failure leaves no
 * half-minified tree unnoticed in the log order.
 */
async function collectJsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectJsFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(path);
    }
  }
  return out;
}

const root = resolve(process.argv[2] ?? process.cwd());
const dist = join(root, 'dist');

const files = await collectJsFiles(dist);
if (files.length === 0) {
  console.warn(`minify-dist: no .js files in ${dist}, skipping`);
  process.exit(0);
}

for (const file of files) {
  buildSync({
    entryPoints: [file],
    outfile: file,
    bundle: false,
    minify: true,
    // esbuild's minifier renames class and function *bindings* by default, so
    // `new NotFoundError().name` came back as `'t'` from the published dist
    // while the same assertion passed against `src/` in the package's own test
    // run. The kit leans on real names in two places that a consumer can
    // observe: `ServiceError` sets `this.name = new.target.name`, and
    // `OutcomeError` derives its wire `type` from it — so a minified build
    // shipped `Exception.Type: 't'` to clients and mangled class names into
    // every log line. Tests run on source, so nothing in CI could see it.
    // Keeping names costs a few bytes and is the only thing that makes the
    // published artifact behave like the tested source.
    keepNames: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: 'external',
    allowOverwrite: true,
    logLevel: 'warning',
  });
}

console.log(`minify-dist: minified ${files.length} files in ${dist}`);
