/**
 * Rewrite imports of a consumer's scope to the kit.
 *
 * Pure text transforms over the import specifier — the one syntax with an
 * unambiguous grammar, so a regex is the honest tool here (the alternative, a
 * full parse, buys nothing for a string literal). Every transformation is
 * table-driven, and the default for a matched package with no rule is *stays
 * local*; a specifier inside a rules package that matches no rule is reported,
 * because a silent skip is how a half-migrated repo typechecks green.
 */
import { IDENTITY_DAO_SUBPATHS, KIT_PACKAGE_FOR, SUBPATH_RULES, WHOLE_PACKAGE_MAP } from './mapping';

export interface RenameResult {
  output: string;
  changes: Array<{ from: string; to: string }>;
  /**
  Specifiers inside a rules package that no rule matched: reported, not skipped.
  */
  unmapped: string[];
}

type MappingOutcome = 'rewritten' | 'local' | 'unruled';

interface SpecifierMapping {
  specifier: string;
  outcome: MappingOutcome;
}

/**
`@scope/pkg/sub/path` → the kit specifier, or `local`/`unruled`.
*/
function mapSpecifier(specifier: string, scope: string): SpecifierMapping {
  const prefix = `${scope}/`;
  if (!specifier.startsWith(prefix)) return { specifier, outcome: 'local' };
  const rest = specifier.slice(prefix.length);
  const slash = rest.indexOf('/');
  const packageName = slash === -1 ? rest : rest.slice(0, slash);
  const subpath = slash === -1 ? '' : rest.slice(slash);

  // Whole-package migration: the repo package is deleted outright.
  if (Object.hasOwn(WHOLE_PACKAGE_MAP, packageName)) {
    const whole = WHOLE_PACKAGE_MAP[packageName];
    return { specifier: subpath === '' ? whole : `${whole}${subpath}`, outcome: 'rewritten' };
  }

  // Subpath rules: the package stays, its kernel moves out.
  if (!Object.hasOwn(SUBPATH_RULES, packageName)) return { specifier, outcome: 'local' }; // business package: never touched
  if (subpath === '') return { specifier, outcome: 'local' }; // the bare package stays local
  const rules = SUBPATH_RULES[packageName];

  // Identity DAOs sit inside `backend-data`, whose `default: null` would
  // otherwise park them as "stays local" forever. Checked *before* the rules so
  // a repo that declares its own row for a given specifier still wins — see the
  // table's doc comment for that escape hatch.
  const hasOverride = Object.hasOwn(rules, subpath);
  if (!hasOverride && packageName === 'backend-data' && Object.hasOwn(IDENTITY_DAO_SUBPATHS, subpath)) {
    return { specifier: IDENTITY_DAO_SUBPATHS[subpath], outcome: 'rewritten' };
  }

  const mapped = rules[subpath];
  if (mapped === null) return { specifier, outcome: 'local' }; // explicitly stays local
  if (mapped === undefined) {
    // `default: null` in the rules means "everything else here stays local";
    // no `default` key at all means "no rule and no stated policy" — reported.
    const hasDefault = Object.hasOwn(rules, 'default');
    const fallback = rules['default'];
    if (!hasDefault || fallback === undefined) {
      // The one-to-one tail: an unmapped *utils* file in shared maps onto the
      // kit's same-named dist module (the kit preserves the src tree).
      if (packageName === 'shared' && subpath.startsWith('/utils/')) {
        return { specifier: `${KIT_PACKAGE_FOR.shared}${subpath.slice('/utils'.length)}`, outcome: 'rewritten' };
      }
      return { specifier, outcome: 'unruled' };
    }
    if (fallback === null) return { specifier, outcome: 'local' };
    return { specifier: fallback, outcome: 'rewritten' };
  }
  if (mapped.startsWith('@')) return { specifier: mapped, outcome: 'rewritten' };
  const kit = KIT_PACKAGE_FOR[packageName];
  return { specifier: mapped === '' ? kit : `${kit}${mapped}`, outcome: 'rewritten' };
}

const IMPORT_PATTERN = /(['"])@[a-z0-9][a-z0-9-]*\/[^'"\n]+\1/g;

/**
Rewrite every import of a consumed scope to the kit, in one file's text.
*/
export function renameImports(source: string, scope: string): RenameResult {
  const changes: Array<{ from: string; to: string }> = [];
  const unmapped: string[] = [];
  const output = source.replaceAll(IMPORT_PATTERN, (match) => {
    const specifier = match.slice(1, -1);
    const mapped = mapSpecifier(specifier, scope);
    if (mapped.outcome === 'rewritten') {
      changes.push({ from: specifier, to: mapped.specifier });
      return `'${mapped.specifier}'`;
    }
    if (mapped.outcome === 'unruled' && !unmapped.includes(specifier)) {
      unmapped.push(specifier);
    }
    return match;
  });
  return { output, changes, unmapped };
}
