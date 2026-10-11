#!/usr/bin/env node
/**
 * Re-point a consumer repo's kit deps at a kit checkout on disk.
 *
 * Used by the kit's consumer-matrix CI: the consumer is cloned fresh (pinned
 * to published versions), and this script rewrites those `@rexezuge/*` deps to
 * `link:` paths into the kit checkout under test, so the consumer's own gates
 * exercise this PR's kit HEAD rather than whatever is published.
 *
 * Outside CI the same script enables a local dev loop: run the kit's tests
 * locally, then `pnpm install` in the consumer to pick up the link:de relink.
 *
 * Usage:
 *   node relink-consumer.mjs --kit /path/to/Software-Development-Kit --consumer /path/to/consumer
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KIT_SCOPE = '@rexezuge/';
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (key && value !== undefined) args[key] = value;
  }
  return args;
}

/** Every package.json of a workspace, at the depths this family uses. */
function manifests(consumerRoot) {
  const roots = ['.', 'packages', 'apps', 'functions', 'scripts', 'test', 'codemods'];
  const found = [];
  for (const dir of roots) {
    const base = join(consumerRoot, dir);
    if (!existsSync(base)) continue;
    if (dir === '.') {
      const candidate = join(base, 'package.json');
      if (existsSync(candidate)) found.push(candidate);
      continue;
    }
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const candidate = join(base, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(candidate)) found.push(candidate);
    }
  }
  return found;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kit = args.kit;
  const consumer = args.consumer;
  if (!kit || !consumer) {
    console.error('Usage: node relink-consumer.mjs --kit <dir> --consumer <dir>');
    process.exit(1);
  }

  let relinked = 0;
  for (const manifest of manifests(consumer)) {
    const source = readFileSync(manifest, 'utf8');
    let manifestJson;
    try {
      manifestJson = JSON.parse(source);
    } catch {
      console.error(`not a valid manifest: ${manifest}`);
      continue;
    }
    let touched = false;
    for (const field of DEP_FIELDS) {
      const deps = manifestJson[field];
      if (!deps) continue;
      for (const name of Object.keys(deps)) {
        if (!name.startsWith(KIT_SCOPE)) continue;
        const packageDir = name.slice(KIT_SCOPE.length);
        const target = join(kit, 'packages', packageDir);
        if (!existsSync(join(target, 'package.json'))) {
          console.error(`kit package ${name} not found at ${target}`);
          process.exit(1);
        }
        deps[name] = `link:${target}`;
        touched = true;
      }
    }
    if (touched) {
      writeFileSync(manifest, `${JSON.stringify(manifestJson, null, 2)}\n`, 'utf8');
      relinked += 1;
      console.log(`relinked ${manifest}`);
    }
  }
  console.log(`done: ${relinked} manifest(s) now link into ${kit}`);
}

main();
