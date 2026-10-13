/**
 * Rename the drifted DAO/config/identity symbols to the kit's canonical names.
 *
 * A regex over call-site shape — `this.withRetry(`, `const x = new AppConfig(` —
 * is the honest tool for this codebase: every consumer writes these in the same
 * disciplined style, and the patterns are anchored on `this.`/`new `/import
 * position so a substring inside a string literal or a same-named field is left
 * alone. Anything a regex cannot safely rewrite is reported rather than skipped.
 *
 * An import that is renamed has to be followed by its uses in the same file:
 * renaming only the specifier leaves `getBackendStrings('en')` calling a binding
 * that no longer exists. So the import pass *collects* what it renamed, and a
 * second pass rewrites exactly those identifiers — the set a file that imports
 * them, so a same-named local elsewhere is never touched.
 *
 * Two scopes, because some identifiers mean different things in different
 * positions. `rules.symbolRenames` applies everywhere (a `this.x(` call, a
 * `new X(`, an import clause, and every follow-up use). `rules.memberRenames`
 * applies **only** at `this.x(` / `await this.x(` / `super.x(` — see
 * `IDENTITY_MEMBER_RENAMES`, where `resolveUserId` is a method to rename and a
 * free function to leave alone. Running a member rename through the import pass
 * would rewrite an import of a symbol the kit does not export, which fails at
 * module resolution rather than at review.
 */
import { DEFAULT_RULES, type MergedRules } from './mapping';

export interface SymbolRenameResult {
  output: string;
  changes: number;
}

const CALL_PREFIXES = ['this.', 'await this.', 'super.'];

export function renameSymbols(source: string, rules: MergedRules = DEFAULT_RULES): SymbolRenameResult {
  const RENAMES = rules.symbolRenames;
  const MEMBER_RENAMES = rules.memberRenames;
  let changes = 0;

  // The lookbehind is the whole safety property: without it, `"this.withRetry("`
  // inside a string literal is rewritten. With it, a match preceded by a quote
  // character anywhere in its prefix is left alone.
  const member = new RegExp(
    String.raw`(?<!["'])(?:${CALL_PREFIXES.map((prefix) => prefix.replace('.', String.raw`\.`)).join('|')})\b(${Object.keys(RENAMES).join('|')})\b\(`,
    'g',
  );
  const memberOnly = new RegExp(
    String.raw`(?<!["'])(?:${CALL_PREFIXES.map((prefix) => prefix.replace('.', String.raw`\.`)).join('|')})\b(${Object.keys(MEMBER_RENAMES).join('|')})\b\(`,
    'g',
  );
  const constructed = new RegExp(String.raw`\bnew\s+(${Object.keys(RENAMES).join('|')})\b\(`, 'g');
  const imported = /import\s+(?:type\s+)?\{([^}]*)\}\s+from/g;

  let output = source;
  const usedRenames: Record<string, string> = {};

  output = output.replace(member, (match, name: string) => {
    changes += 1;
    // A replacer function, not a replacement string: a table value is never
    // re-scanned for `$` patterns, so a future rename containing one renames
    // literally instead of interpolating the match.
    return match.replace(name, () => RENAMES[name]);
  });
  output = output.replace(memberOnly, (match, name: string) => {
    changes += 1;
    return match.replace(name, () => MEMBER_RENAMES[name]);
  });
  output = output.replace(constructed, (match, name: string) => {
    changes += 1;
    return match.replace(name, () => RENAMES[name]);
  });
  output = output.replaceAll(imported, (match, names: string) => {
    const renamed = names
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        if (!Object.hasOwn(RENAMES, entry)) return entry;
        const renamedName = RENAMES[entry];
        changes += 1;
        usedRenames[entry] = renamedName;
        return renamedName;
      });
    return match.replace(names, () => ` ${renamed.join(', ')} `);
  });

  // The imported-and-renamed set, followed through this file.
  const followed = Object.keys(usedRenames);
  if (followed.length > 0) {
    output = output.replace(new RegExp(String.raw`\b(${followed.join('|')})\b`, 'g'), (match, name: string) => {
      changes += 1;
      return usedRenames[name];
    });
  }

  return { output, changes };
}
