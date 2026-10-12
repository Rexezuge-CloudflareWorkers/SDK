/**
 * Orchestrator tests for `adopt.ts`.
 *
 * The pure renamers were already covered by `codemods.test.ts`; what was not
 * covered was the part that runs `--write` across a real repository — the scan,
 * the write, and the package-removal decision. That path is the one an operator
 * points at a 500-file consumer repo, so it gets its own suite here.
 *
 * The orchestrator is exercised through a temporary fixture repo rather than by
 * importing `main()`, so the test covers the file-walking and the flags as an
 * operator meets them. `main()` is guarded so importing this module is inert.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ADOPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'adopt.ts');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
Build a throwaway consumer repo. `files` are paths relative to the root.
*/
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'adopt-test-'));
  roots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const full = path.join(root, relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function adopt(root: string, args: readonly string[] = []): string {
  // `npx` is resolved from PATH deliberately: the suite exercises the CLI the
  // way an operator meets it, on whatever machine runs the tests.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return execFileSync('npx', ['tsx', ADOPT, root, '--scope', '@dav', ...args], {
    encoding: 'utf8',
    cwd: path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  });
}

const SDK_PACKAGE_JSON = JSON.stringify({ name: '@dav/backend-errors', version: '1.0.0' });

describe('adopt: scanning and rewriting', () => {
  it('rewrites imports and reports the counts', () => {
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'apps/api/src/index.ts': "import { BadRequestError } from '@dav/backend-errors';\nexport const x = new BadRequestError();\n",
    });

    const output = adopt(root, ['--write']);

    expect(output).toContain('files changed:   1');
    expect(output).toContain('import rewrites: 1');
    expect(readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8')).toContain("from '@rexezuge/errors'");
  });

  it('writes nothing in a dry run', () => {
    const source = "import { BadRequestError } from '@dav/backend-errors';\n";
    const root = fixture({ 'packages/backend-errors/package.json': SDK_PACKAGE_JSON, 'apps/api/src/index.ts': source });

    adopt(root);

    // The report still counts the change, but the file is untouched — a dry run
    // that wrote anyway would be the worst possible failure for this tool.
    expect(readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8')).toBe(source);
  });

  it('is idempotent: a second run changes nothing', () => {
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'apps/api/src/index.ts': "import { BadRequestError } from '@dav/backend-errors';\nexport const x = 1;\n",
    });

    adopt(root, ['--write']);
    const second = adopt(root, ['--write']);

    // Second pass must be a no-op. A non-idempotent rename is how a re-run
    // silently mangles a repo an operator thought was already migrated.
    expect(second).toContain('files changed:   0');
    expect(second).toContain('import rewrites: 0');
  });

  it('skips node_modules, dist and coverage', () => {
    const stray = "import { BadRequestError } from '@dav/backend-errors';\n";
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'apps/api/src/index.ts': 'export const x = 1;\n',
      'node_modules/thing/index.ts': stray,
      'apps/api/dist/index.ts': stray,
      'apps/api/coverage/index.ts': stray,
    });

    const output = adopt(root, ['--write']);

    expect(output).toContain('files changed:   0');
    expect(readFileSync(path.join(root, 'node_modules/thing/index.ts'), 'utf8')).toBe(stray);
  });

  it('reports an unmapped subpath rather than guessing past the table', () => {
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'apps/api/src/index.ts': "import { thing } from '@dav/shared/not-a-mapped-subpath';\n",
    });

    expect(adopt(root)).toContain('UNMAPPED');
  });
});

describe('adopt: web components', () => {
  const VIEW = [
    "import { AppPage } from '../components/layout/AppPage';",
    "import { RefreshButton } from '../components/shared/RefreshButton';",
    "import { VolumeDAO } from '../dao/VolumeDAO';",
    '',
    'export function View() {',
    '  return null;',
    '}',
    '',
  ].join('\n');

  it('moves relative component imports onto the kit', () => {
    const root = fixture({ 'apps/web/src/views/View.tsx': VIEW });

    const output = adopt(root, ['--write']);

    expect(output).toContain('component moves: 2 (onto @rexezuge/web)');
    const rewritten = readFileSync(path.join(root, 'apps/web/src/views/View.tsx'), 'utf8');
    expect(rewritten).toContain("import { AppPage, RefreshButton } from '@rexezuge/web';");
    // The unrelated local import is untouched, and still in place.
    expect(rewritten).toContain("import { VolumeDAO } from '../dao/VolumeDAO';");
  });

  it('names the components the kit has NOT converged, rather than skipping them', () => {
    const root = fixture({
      'apps/web/src/views/View.tsx': "import { VolumeCard } from '../components/volume/VolumeCard';\n",
    });

    // A silent skip here is how a repo ends up half-migrated and green.
    expect(adopt(root)).toContain('components the kit has NOT converged (left as-is): VolumeCard');
  });

  it('leaves an unconverged component exactly as it was', () => {
    const source = "import { VolumeCard } from '../components/volume/VolumeCard';\n";
    const root = fixture({ 'apps/web/src/views/View.tsx': source });

    adopt(root, ['--write']);

    expect(readFileSync(path.join(root, 'apps/web/src/views/View.tsx'), 'utf8')).toBe(source);
  });

  it('is idempotent across a second run', () => {
    const root = fixture({ 'apps/web/src/views/View.tsx': VIEW });

    adopt(root, ['--write']);
    const second = adopt(root, ['--write']);

    expect(second).toContain('files changed:   0');
    expect(second).toContain('component moves: 0');
  });
});

describe('adopt: --remove-packages', () => {
  it('offers a package whose imports all migrated away', () => {
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'packages/backend-data/package.json': JSON.stringify({ name: '@dav/backend-data' }),
      'apps/api/src/index.ts': "import { BadRequestError } from '@dav/backend-errors';\nimport { SongDAO } from '@dav/backend-data/dao';\n",
    });

    const output = adopt(root, ['--write']);

    // backend-errors was fully migrated; backend-data still has a live import.
    expect(output).toContain('no remaining imports (1): @dav/backend-errors');
    expect(output).toContain('@dav/backend-data ×1');
  });

  it('removes only the unreferenced package, and only with --write', () => {
    const root = fixture({
      'packages/backend-errors/package.json': SDK_PACKAGE_JSON,
      'packages/backend-data/package.json': JSON.stringify({ name: '@dav/backend-data' }),
      'packages/backend-data/src/dao/SongDAO.ts': 'export class SongDAO {}\n',
      'apps/api/src/index.ts': "import { BadRequestError } from '@dav/backend-errors';\nimport { SongDAO } from '@dav/backend-data/dao';\n",
    });

    // Dry run: nothing is deleted even with the flag, because the flag alone
    // does not imply consent to write.
    adopt(root, ['--remove-packages']);
    expect(existsSync(path.join(root, 'packages/backend-errors'))).toBe(true);

    adopt(root, ['--write', '--remove-packages']);

    expect(existsSync(path.join(root, 'packages/backend-errors'))).toBe(false);
    expect(existsSync(path.join(root, 'packages/backend-data'))).toBe(true);
  });

  it('counts a package still imported by a subpath', () => {
    const root = fixture({
      'packages/backend-data/package.json': JSON.stringify({ name: '@dav/backend-data' }),
      'apps/api/src/index.ts': "import { SongDAO } from '@dav/backend-data/dao';\n",
      'apps/api/src/other.ts': "import { AlbumDAO } from '@dav/backend-data/dao';\n",
    });

    expect(adopt(root)).toContain('@dav/backend-data ×2');
  });

  it('does not confuse a package whose name shares a prefix with another', () => {
    // `@dav/backend-errors` and `@dav/backend-errors-extra` are different
    // packages. The only import names the *first*, so a prefix-matching counter
    // would wrongly credit it to the second and report the second as still
    // live. Exact matching is what makes it come back unreferenced — and the
    // deletion below is the assertion: it is removed *because* nothing
    // references it, and removing it is safe only if the count was right.
    const root = fixture({
      'packages/backend-errors-extra/package.json': JSON.stringify({ name: '@dav/backend-errors-extra' }),
      'apps/api/src/index.ts': "import { BadRequestError } from '@dav/backend-errors';\n",
    });

    const output = adopt(root, ['--write', '--remove-packages']);

    expect(output).toContain('no remaining imports (1): @dav/backend-errors-extra');
    expect(output).not.toContain('@dav/backend-errors-extra ×');
    expect(existsSync(path.join(root, 'packages/backend-errors-extra'))).toBe(false);
  });

  it('is a no-op for a repo with no packages directory', () => {
    const root = fixture({ 'apps/api/src/index.ts': 'export const x = 1;\n' });

    expect(() => adopt(root, ['--write', '--remove-packages'])).not.toThrow();
  });
});

describe('adopt: flags', () => {
  it('exits non-zero without a root or scope', () => {
    const root = fixture({ 'apps/api/src/index.ts': 'export const x = 1;\n' });

    // Same PATH reliance as the `adopt` helper above: the assertion is about the
    // exit code an operator sees, so the invocation has to match theirs.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    expect(() => execFileSync('npx', ['tsx', ADOPT, root], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    expect(() => execFileSync('npx', ['tsx', ADOPT], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });
});
