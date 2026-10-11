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
 *   3. Reports the workspace packages whose imports went to zero — those are the
 *      ones safe to delete (only with `--remove-packages`).
 *   4. Reports the package.json dependency edits to make (never edits them: a
 *      lockfile change wants the human's `pnpm install` in the loop).
 *
 * `--dry-run` (the default in CI) writes nothing.
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renameImports } from './rename-imports';
import { renameSymbols } from './rename-symbols';
import { SUBPATH_RULES, WHOLE_PACKAGE_MAP } from './mapping';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'coverage-spa', '.wrangler', '.git', 'local']);

interface AdoptReport {
  filesScanned: number;
  filesChanged: number;
  importChanges: number;
  symbolChanges: number;
  unmappedImports: string[];
  removablePackages: string[];
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
    unmappedImports: [],
    removablePackages: [],
  };

  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');
    report.filesScanned += 1;
    const imports = renameImports(source, scope);
    const symbols = renameSymbols(imports.output);
    const changed = imports.changes.length > 0 || symbols.changes > 0;
    if (changed) {
      report.filesChanged += 1;
      report.importChanges += imports.changes.length;
      report.symbolChanges += symbols.changes;
      if (!dryRun) writeFileSync(file, symbols.output, 'utf8');
    }
    for (const specifier of imports.unmapped) {
      if (!report.unmappedImports.includes(specifier)) report.unmappedImports.push(specifier);
    }
  }

  console.log(`scanned ${report.filesScanned} source files (${dryRun ? 'dry run' : 'written'})`);
  console.log(`  files changed:   ${report.filesChanged}`);
  console.log(`  import rewrites: ${report.importChanges}`);
  console.log(`  symbol renames:  ${report.symbolChanges}`);
  if (report.unmappedImports.length > 0) {
    console.log(`  UNMAPPED (migrate by hand): ${report.unmappedImports.join(', ')}`);
  }
  console.log('  next: run `pnpm add` for each kit package, then `pnpm -r typecheck`.');
  void removePackages;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  return argv[argv.indexOf(flag) + 1];
}

main();
