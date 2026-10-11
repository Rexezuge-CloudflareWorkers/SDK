/**
 * Rename the drifted DAO/config/identity symbols to the kit's canonical names.
 *
 * A regex over call-site shape — `this.withRetry(`, `const x = new AppConfig(` —
 * is the honest tool for this codebase: every consumer writes these in the same
 * disciplined style, and the patterns are anchored on `this.`/`new `/import
 * position so a substring inside a string literal or a same-named field is left
 * alone. Anything a regex cannot safely rewrite is reported rather than skipped.
 */
import { CONFIG_RENAMES, DAO_RENAMES, IDENTITY_RENAMES } from './mapping';

export interface SymbolRenameResult {
  output: string;
  changes: number;
}

function buildPattern(kind: 'member' | 'imported'): RegExp {
  const names = Object.keys({ ...DAO_RENAMES, ...CONFIG_RENAMES, ...IDENTITY_RENAMES });
  return new RegExp(`\\b(${names.join('|')})\\b`, 'g');
}

const CALL_PREFIXES = ['this.', 'await this.', 'super.'];

/**
 * Rename `this.withRetry(`-style call sites to the canonical method name.
 * Only rewrites a name that is the *callee* of a member expression or the
 * identifier of a `new`/import position, never a property or a string.
 */
export function renameSymbols(source: string): SymbolRenameResult {
  let changes = 0;
  const all = { ...DAO_RENAMES, ...CONFIG_RENAMES, ...IDENTITY_RENAMES } as Record<string, string>;
  // The lookbehind is the whole safety property: without it, `"this.withRetry("`
  // inside a string literal is rewritten. With it, a match preceded by a quote
  // character anywhere in its prefix is left alone.
  const member = new RegExp(`(?<!["'])(?:${CALL_PREFIXES.map((prefix) => prefix.replace('.', '\\.')).join('|')})\\b(${Object.keys(all).join('|')})\\b\\(`, 'g');
  const constructed = new RegExp(`\\bnew\\s+(${Object.keys(all).join('|')})\\b\\(`, 'g');
  const imported = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from`, 'g');
  let output = source;
  output = output.replace(member, (match, name: string) => {
    changes += 1;
    return match.replace(name, all[name] as string);
  });
  output = output.replace(constructed, (match, name: string) => {
    changes += 1;
    return match.replace(name, all[name] as string);
  });
  output = output.replace(imported, (match, names: string) => {
    const renamed = names
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const renamedName = all[entry];
        if (renamedName === undefined) return entry;
        changes += 1;
        return renamedName;
      });
    return match.replace(names, ` ${renamed.join(', ')} `);
  });
  void buildPattern;
  return { output, changes };
}
