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
import { DEFAULT_RULES, WHOLE_PACKAGE_MAP, type MergedRules } from './mapping';

export interface RenameResult {
  output: string;
  changes: Array<{ from: string; to: string }>;
  /**
   * Specifiers inside a rules package that no rule matched: reported, not skipped.
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
function mapSpecifier(specifier: string, scope: string, rules: MergedRules): SpecifierMapping {
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
  if (!Object.hasOwn(rules.subpathRules, packageName)) return { specifier, outcome: 'local' }; // business package: never touched
  if (subpath === '') return { specifier, outcome: 'local' }; // the bare package stays local
  const rows = rules.subpathRules[packageName];

  // Identity DAOs sit inside `backend-data`, whose `default: null` would
  // otherwise park them as "stays local" forever. Checked *before* the rows so a
  // repo that declares its own row for a given specifier still wins — see the
  // table's doc comment for that escape hatch.
  const hasOverride = Object.hasOwn(rows, subpath);
  if (!hasOverride && packageName === 'backend-data' && Object.hasOwn(rules.identityDaoSubpaths, subpath)) {
    const identity = rules.identityDaoSubpaths[subpath];
    return identity === null ? { specifier, outcome: 'local' } : { specifier: identity, outcome: 'rewritten' };
  }

  const mapped = rows[subpath];
  if (mapped === null) return { specifier, outcome: 'local' }; // explicitly stays local
  if (mapped === undefined) {
    // `default: null` in the rows means "everything else here stays local";
    // no `default` key at all means "no rule and no stated policy" — reported.
    const hasDefault = Object.hasOwn(rows, 'default');
    const fallback = rows['default'];
    if (!hasDefault || fallback === undefined) {
      // No tail. A one-to-one tail used to rewrite any `shared/utils/X` onto
      // `@rexezuge/shared/X`, on the theory that the kit preserves the src
      // tree. It does — but only for the files it actually converged. Edge-Git
      // ships `BranchValidation`, `ConcurrencyUtil`, `GitOids`,
      // `SlugValidation` and `SsrfHosts` there and the kit has none of them, so
      // the tail rewrote live imports onto modules that do not exist and the
      // build failed at resolution rather than at review. An unmapped file is
      // a fact the operator can see in this report; a wrong rewrite is not.
      return { specifier, outcome: 'unruled' };
    }
    if (fallback === null) return { specifier, outcome: 'local' };
    return { specifier: fallback, outcome: 'rewritten' };
  }
  if (mapped.startsWith('@')) return { specifier: mapped, outcome: 'rewritten' };
  // The `''` shorthand ("this file moved, the kit keeps the name") resolves
  // against the same table, so a repo that re-points a package's kernel target
  // overrides this too rather than only the explicit specifiers.
  const kit = rules.kitPackageFor[packageName];
  if (kit === undefined) return { specifier, outcome: 'unruled' };
  return { specifier: mapped === '' ? kit : `${kit}${mapped}`, outcome: 'rewritten' };
}

const IMPORT_PATTERN = /(['"])@[a-z0-9][a-z0-9-]*\/[^'"\n]+\1/g;

/**
 * Rewrite every import of a consumed scope to the kit, in one file's text.
 *
 * `rules` defaults to the shipped tables; pass a merged set to honour a repo's
 * `--rules` file. It is a parameter rather than module state so the orchestrator
 * can migrate two roots with different overrides in one process.
 */
export function renameImports(source: string, scope: string, rules: MergedRules = DEFAULT_RULES): RenameResult {
  const changes: Array<{ from: string; to: string }> = [];
  const unmapped: string[] = [];
  const output = source.replaceAll(IMPORT_PATTERN, (match) => {
    const specifier = match.slice(1, -1);
    const mapped = mapSpecifier(specifier, scope, rules);
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
