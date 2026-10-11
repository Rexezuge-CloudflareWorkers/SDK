#!/usr/bin/env tsx
/**
 * Migrate a consumer repo onto @rexezuge/*.
 *
 * Usage:
 *   tsx src/adopt.ts <consumer-root> --scope @my-app [--dry-run] [--remove-packages]
 *
 * What it does, in order:
 *   1. Rewrites every `@scope/<pkg>` import to the kit specifier.
 *   2. Renames the drifted symbols (withRetry→run, AppConfig→AppConfiguration, …)
 *      at call, construction, and import sites.
 *   3. Rewrites the **relative** `components/…` imports onto `@rexezuge/web` for
 *      the components the kit has converged, and reports the ones it has not.
 *   4. Reports the workspace packages whose imports went to zero — those are the
 *      ones safe to delete (only with `--write --remove-packages`). Packages that
 *      are still imported are reported **with their reference counts**, so the
 *      zero-import list is never mistaken for the whole picture.
 *   5. Reports the package.json dependency edits to make (never edits them: a
 *      lockfile change wants the human's `pnpm install` in the loop).
 *
 * `--dry-run` (the default in CI) writes nothing.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renameImports } from './rename-imports';
import { renameSymbols } from './rename-symbols';
import { SUBPATH_RULES, WHOLE_PACKAGE_MAP } from './mapping';
import { rewriteComponentImports } from './web-components';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'coverage-spa', '.wrangler', '.git', 'local']);

interface AdoptReport {
  filesScanned: number;
  filesChanged: number;
  importChanges: number;
  symbolChanges: number;
  /** Component files this run moved onto `@rexezuge/web`. */
  componentChanges: number;
  unmappedImports: string[];
  unmappedComponents: string[];
  removablePackages: string[];
}

/**
 * Workspace packages, mapped to how many imports still point at each one.
 *
 * This is what makes `--remove-packages` safe rather than a guess: a package is
 * only offered for deletion when **nothing in the scanned tree still imports
 * it**, so a package whose imports are still live is reported with its count
 * instead of being removed out from under a working build.
 */
function collectWorkspacePackages(root: string, scope: string): Map<string, { dir: string; references: number }> {
  const packages = new Map<string, { dir: string; references: number }>();
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return packages;
  for (const entry of readdirSync(packagesDir)) {
    const dir = join(packagesDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, 'package.json'))) {
      packages.set(`${scope}/${entry}`, { dir, references: 0 });
    }
  }
  return packages;
}

/** Count the imports in `source` that name each tracked workspace package. */
function countReferences(source: string, scope: string, packages: Map<string, { dir: string; references: number }>): void {
  for (const name of packages.keys()) {
    // Matches `@scope/pkg` and `@scope/pkg/sub` but not `@scope/pkg-extra`,
    // which is a different package whose name merely starts with the same text.
    const pattern = new RegExp(`from\\s+['"\`]${escapeRegExp(name)}(?:['"\`/])`);
    const matches = source.match(pattern);
    if (matches) {
      const entry = packages.get(name);
      if (entry) entry.references += matches.length;
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(full);
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const root = argv.find((argument) => !argument.startsWith('--'));
  const scope = flagValue(argv, '--scope');
  const dryRun = !argv.includes('--write');
  const removePackages = argv.includes('--remove-packages');
  if (!root || !scope) {
    console.error('Usage: tsx src/adopt.ts <consumer-root> --scope @my-app [--write] [--remove-packages]');
    process.exit(1);
  }

  const report: AdoptReport = {
    filesScanned: 0,
    filesChanged: 0,
    importChanges: 0,
    symbolChanges: 0,
    componentChanges: 0,
    unmappedImports: [],
    unmappedComponents: [],
    removablePackages: [],
  };

  // Counts are taken against the **post-rewrite** text, so a package whose only
  // imports were the ones this run migrated reads as unreferenced rather than as
  // still-live. Counting the pre-rewrite text would report every migrated
  // package as still in use and make the removal list permanently empty.
  const packages = collectWorkspacePackages(root, scope);

  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');
    report.filesScanned += 1;
    const imports = renameImports(source, scope);
    // Component imports are relative, not `@scope/pkg`, so the kernel rename
    // cannot see them. This runs after it because `renameSymbols` may have
    // changed a component name on the way past — running it first would rewrite
    // a specifier whose identifier no longer matches what the file uses.
    const components = rewriteComponentImports(imports.output);
    const symbols = renameSymbols(components.output);
    const changed = imports.changes.length > 0 || symbols.changes > 0 || components.changed.length > 0;
    if (changed) {
      report.filesChanged += 1;
      report.importChanges += imports.changes.length;
      report.symbolChanges += symbols.changes;
      report.componentChanges += components.changed.length;
      if (!dryRun) writeFileSync(file, symbols.output, 'utf8');
    }
    countReferences(symbols.output, scope, packages);
    for (const specifier of imports.unmapped) {
      if (!report.unmappedImports.includes(specifier)) report.unmappedImports.push(specifier);
    }
    for (const component of components.unmapped) {
      if (!report.unmappedComponents.includes(component)) report.unmappedComponents.push(component);
    }
  }

  const stillReferenced = [...packages.entries()].filter(([, value]) => value.references > 0);
  const unreferenced = [...packages.entries()].filter(([, value]) => value.references === 0);
  report.removablePackages = unreferenced.map(([name]) => name);

  console.log(`scanned ${report.filesScanned} source files (${dryRun ? 'dry run' : 'written'})`);
  console.log(`  files changed:   ${report.filesChanged}`);
  console.log(`  import rewrites: ${report.importChanges}`);
  console.log(`  symbol renames:  ${report.symbolChanges}`);
  console.log(`  component moves: ${report.componentChanges} (onto @rexezuge/web)`);
  if (report.unmappedImports.length > 0) {
    console.log(`  UNMAPPED (migrate by hand): ${report.unmappedImports.join(', ')}`);
  }
  if (report.unmappedComponents.length > 0) {
    // Distinct from the package unmapped list, and reported rather than skipped
    // for the same reason: a component the kit has not converged is fine, but a
    // missing table row is a silent half-migration.
    console.log(`  components the kit has NOT converged (left as-is): ${report.unmappedComponents.join(', ')}`);
  }

  if (unreferenced.length > 0) {
    console.log(`  no remaining imports (${unreferenced.length}): ${unreferenced.map(([name]) => name).join(', ')}`);
  }
  if (stillReferenced.length > 0) {
    // Reported with their counts, because "still imported" is the answer that
    // keeps a half-migrated repo honest: it names what is still live instead of
    // letting an operator assume the list above is the whole truth.
    console.log(
      `  still imported (${stillReferenced.length}): ${stillReferenced.map(([name, value]) => `${name} ×${value.references}`).join(', ')}`,
    );
  }

  if (removePackages) {
    // Guarded twice: `--remove-packages` never implies `--write`, and only a
    // package with zero remaining imports is touched. Deleting a package that
    // something still imports turns a migration into a broken build, and the
    // cost of being wrong here is a red test suite rather than a reviewable diff.
    if (dryRun) {
      console.log('  --remove-packages needs --write too; reporting only. Re-run with --write to delete.');
    } else {
      for (const [name, value] of unreferenced) {
        rmSync(value.dir, { recursive: true, force: true });
        console.log(`  removed ${name}`);
      }
      console.log('  next: remove the dropped packages from the workspace package.json files.');
    }
  }

  console.log('  next: run `pnpm add` for each kit package, then `pnpm -r typecheck`.');
}

/**
 * Read a `--flag value` pair.
 *
 * Returns `undefined` when the flag is absent. The absent case is the reason
 * this is not an inline `argv[argv.indexOf(flag) + 1]`: `indexOf` answers `-1`
 * for a missing flag, so that expression yields `argv[0]` — the **positional
 * root** — and the missing `--scope` silently becomes the scope. The tool would
 * then scan the repo, rewrite nothing, and report a clean run against a scope
 * that matches no import in it.
 */
function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

// Entry-point guard rather than a bare `main()`, so importing this module for a
// test does not immediately walk and rewrite whatever directory the test runner
// was started from. Same shape as the `scripts/verify-*.ts` entry points.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
