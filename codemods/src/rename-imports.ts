/**
 * Rewrite imports of a consumer's scope to the kit.
 *
 * Pure text transforms over the import specifier — the one syntax with an
 * unambiguous grammar, so a regex is the honest tool here (the alternative, a
 * full parse, buys nothing for a string literal). Every transformation is
 * table-driven; anything unmapped is left untouched and reported, because a
 * silent skip is how a half-migrated repo typechecks green.
 */
import { PACKAGE_MAP, SUBPATH_MAP } from './mapping';

export interface RenameResult {
  output: string;
  changes: Array<{ from: string; to: string }>;
  unmapped: string[];
}

/** `@scope/pkg/...` → kit specifier, or null when the source is not a mapped package. */
function mapSpecifier(specifier: string, scope: string): string | null {
  if (!specifier.startsWith(`${scope}/`)) return null;
  const rest = specifier.slice(scope.length + 1);
  const segments = rest.split('/');
  const packageName = segments[0] ?? '';
  const kit = PACKAGE_MAP[packageName];
  if (!kit) return null;
  if (segments.length === 1) return kit;
  const subpath = `/${segments.slice(1).join('/')}`;
  const SUBPATH_MAP_ENTRY = SUBPATH_MAP[kit]?.[subpath];
  if (SUBPATH_MAP_ENTRY === undefined) {
    // Subpaths not in the table map one-to-one: the kit preserves the src tree
    // in dist, so `shared/utils/UUIDUtil` → `@rexezuge/shared/UUIDUtil`.
    if (subpath.startsWith('/utils/')) return `${kit}${subpath.slice('/utils'.length)}`;
    return `${kit}${subpath}`;
  }
  // A mapped value starting with '@' is a complete cross-package specifier
  // (e.g. shared/i18n → @rexezuge/i18n), not a subpath of this package.
  if (SUBPATH_MAP_ENTRY.startsWith('@')) return SUBPATH_MAP_ENTRY;
  return SUBPATH_MAP_ENTRY === '' ? kit : `${kit}${SUBPATH_MAP_ENTRY}`;
}

const IMPORT_PATTERN = /(['"])(@[a-z0-9][a-z0-9-]*)\/[^'"\n]+\1/g;

/** Rewrite every import of a consumed scope to the kit, in one file's text. */
export function renameImports(source: string, scope: string): RenameResult {
  const changes: Array<{ from: string; to: string }> = [];
  const unmapped: string[] = [];
  const output = source.replace(IMPORT_PATTERN, (match) => {
    const specifier = match.slice(1, -1);
    const mapped = mapSpecifier(specifier, scope);
    if (mapped === null) {
      const pkg = specifier.split('/')[1] ?? '';
      if (PACKAGE_MAP[pkg]) unmapped.push(specifier);
      return match;
    }
    if (mapped !== specifier) changes.push({ from: specifier, to: mapped });
    return `'${mapped}'`;
  });
  return { output, changes, unmapped: [...new Set(unmapped)] };
}
