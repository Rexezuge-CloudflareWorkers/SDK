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
 */
import { CONFIG_RENAMES, DAO_RENAMES, I18N_RENAMES, IDENTITY_RENAMES } from './mapping';

export interface SymbolRenameResult {
  output: string;
  changes: number;
}

const CALL_PREFIXES = ['this.', 'await this.', 'super.'];

/** Every rename table, composed once: the DAO/config/identity/i18n surfaces. */
const RENAMES: Record<string, string> = { ...DAO_RENAMES, ...CONFIG_RENAMES, ...IDENTITY_RENAMES, ...I18N_RENAMES };

export function renameSymbols(source: string): SymbolRenameResult {
  let changes = 0;

  // The lookbehind is the whole safety property: without it, `"this.withRetry("`
  // inside a string literal is rewritten. With it, a match preceded by a quote
  // character anywhere in its prefix is left alone.
  const member = new RegExp(
    `(?<!["'])(?:${CALL_PREFIXES.map((prefix) => prefix.replace('.', '\\.')).join('|')})\\b(${Object.keys(RENAMES).join('|')})\\b\\(`,
    'g',
  );
  const constructed = new RegExp(`\\bnew\\s+(${Object.keys(RENAMES).join('|')})\\b\\(`, 'g');
  const imported = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from`, 'g');

  let output = source;
  const usedRenames: Record<string, string> = {};

  output = output.replace(member, (match, name: string) => {
    changes += 1;
    return match.replace(name, RENAMES[name] as string);
  });
  output = output.replace(constructed, (match, name: string) => {
    changes += 1;
    return match.replace(name, RENAMES[name] as string);
  });
  output = output.replace(imported, (match, names: string) => {
    const renamed = names
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const renamedName = RENAMES[entry];
        if (renamedName === undefined) return entry;
        changes += 1;
        usedRenames[entry] = renamedName;
        return renamedName;
      });
    return match.replace(names, ` ${renamed.join(', ')} `);
  });

  // The imported-and-renamed set, followed through this file.
  const followed = Object.keys(usedRenames);
  if (followed.length > 0) {
    output = output.replace(new RegExp(`\\b(${followed.join('|')})\\b`, 'g'), (match, name: string) => {
      changes += 1;
      return usedRenames[name] as string;
    });
  }

  return { output, changes };
}
