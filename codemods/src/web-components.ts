/**
 * The web component table, and the transform that reaches it.
 *
 * ## Why this is not a `SUBPATH_RULES` row
 *
 * Every other codemod in this package keys off `@scope/pkg` specifiers, because
 * that is how a consumer imports its own `backend-*` packages. It does **not**
 * import its own web app that way. Every component import in the family is
 * relative:
 *
 * ```text
 * 18x  '../components/ui/Card'
 * 18x  '../components/layout/AppPage'
 * 10x  '../components/ui/Button'
 *  5x  '../components/shared/RefreshButton'
 * ```
 *
 * across five different prefixes (`./components/`, `../components/`,
 * `../../components/`, …) and four different directories. `renameImports` would
 * never see one of these, so `SUBPATH_RULES` cannot reach them no matter what
 * rows it holds.
 *
 * So this is a separate transform, matching on **basename** and ignoring both
 * the leading directory and the prefix. That is sound here for a reason that is
 * specific to these names: `Card`, `Button`, `Badge` and `Input` are also the
 * names of unrelated things elsewhere in a repo, so the match deliberately
 * requires the literal `components/` segment immediately before the file name
 * rather than accepting any path ending in `/Card`.
 */

/**
The one specifier this transform rewrites to. See {@link mergeDuplicateImports}.
*/
const WEB_COMPONENT_TARGET = '@rexezuge/web';

/**
 * Component file name → the kit export it becomes.
 *
 * Every row here is a component this kit converged **from** the family, so each
 * one is equivalent to the copies by construction rather than by inspection.
 *
 * ## What is deliberately absent
 *
 * **`Button`, `Card`, `Badge`, `Input` are not here, and that is not an
 * oversight.** They are already in `@rexezuge/web`, but the kit's versions are
 * *not* the repos' — the kit's `Button` replaced `class-variance-authority` with
 * a plain `Record` and is 124 lines against the repos' 40. The call sites look
 * compatible, but they were not verified the way the rows above were, and adding
 * them would let `adopt.ts` silently restyle six repos. That is a separate audit
 * with its own diff review, not a line in a table.
 */
const WEB_COMPONENT_MAP: Readonly<Record<string, string>> = {
  // Converged in the first round, alongside `ModalShell` and `PageState`.
  ModalShell: WEB_COMPONENT_TARGET,
  ConfirmDeleteModal: WEB_COMPONENT_TARGET,
  PageState: WEB_COMPONENT_TARGET,

  // Converged here. See each file's header for which repo's copy was the base
  // and which of the three divergences was settled.
  AppPage: WEB_COMPONENT_TARGET,
  PageHeaderCard: WEB_COMPONENT_TARGET,
  ContextBar: WEB_COMPONENT_TARGET,
  Unauthorized: WEB_COMPONENT_TARGET,
  NoticeBar: WEB_COMPONENT_TARGET,
  LanguageSelector: WEB_COMPONENT_TARGET,
  RefreshButton: WEB_COMPONENT_TARGET,
  ReadOnlyField: WEB_COMPONENT_TARGET,
  TypeToConfirmModal: WEB_COMPONENT_TARGET,
};

/**
 * `from '<any prefix>components/<dir>/<Name>'`.
 *
 * Requires the `components/` segment so a `Card` or `Input` reached by some other
 * path is not caught. The trailing quote is required so `AppPage` does not match
 * `AppPageHeader`.
 */
const COMPONENT_IMPORT_PATTERN = /from\s+(['"])(?:\.{1,2}\/)+components\/(?:[^'"]*\/)?([A-Z][A-Za-z0-9]*)\1/g;

interface RewriteResult {
  output: string;
  /**
  File names this run moved to `@rexezuge/web`.
  */
  changed: string[];
  /**
   * Files under a `components/` directory whose name is not in the table.
   *
   * Reported rather than skipped: an unmapped component is either one the kit has
   * not converged (fine, and worth knowing) or one whose row was forgotten (a
   * silent half-migration). Either way the operator should see it.
   */
  unmapped: string[];
}

/**
 * Rewrite relative component imports onto `@rexezuge/web`.
 *
 * Merges duplicate specifiers per file: a view importing both `Button` and
 * `Badge` arrives here as two separate import statements, and rewriting both
 * naively leaves two `from '@rexezuge/web'` lines in one file. Two imports from
 * one module are legal, but they read as an accident and most linters flag them.
 */
function rewriteComponentImports(source: string): RewriteResult {
  const changed = new Set<string>();
  const unmapped = new Set<string>();

  const output = source.replaceAll(COMPONENT_IMPORT_PATTERN, (match, quote: string, name: string) => {
    if (!Object.hasOwn(WEB_COMPONENT_MAP, name)) {
      // Still under `components/`, still not ours — e.g. a repo-local
      // `components/volume/VolumeCard.tsx`. Leave the line exactly as it was.
      unmapped.add(name);
      return match;
    }
    const target = WEB_COMPONENT_MAP[name];
    changed.add(name);
    return `from ${quote}${target}${quote}`;
  });

  return { output: mergeDuplicateImports(output), changed: [...changed], unmapped: [...unmapped] };
}

/**
 * Collapse repeated `from '@rexezuge/web'` clauses into one statement.
 *
 * Deliberately narrow, because this runs over every file in a consumer repo:
 *
 * - Only clauses naming the **one** module this transform rewrites to are
 *   touched. Every other import stays byte-identical and in place — a general
 *   import-normalising pass would reorder unrelated specifiers and produce a diff
 *   nobody asked for.
 * - Only single-line clauses are merged. A multi-line `import {\n  A,\n  B,\n}`
 *   is left exactly as written rather than reformatted by a regex that never
 *   parsed it, so the transform cannot corrupt it.
 * - A clause containing an `as` rename, a default import, or a namespace import
 *   is left alone. Merging those requires knowing which identifier survived the
 *   rename, which a text transform does not.
 * - `import type` clauses merge only with other `import type` clauses; mixing
 *   them would silently drop the type-only guarantee.
 */
function mergeDuplicateImports(source: string): string {
  const lines = source.split('\n');
  /**
  Index of the line already holding each merged name list, by specifier+kind.
  */
  const mergedInto = new Map<string, number>();
  const namesFor = new Map<string, string[]>();
  const dropped = new Set<number>();

  const clause = (line: string): { kind: 'type' | 'value'; body: string; quote: string; specifier: string } | null => {
    // Both quote styles, because {@link rewriteComponentImports} preserves
    // whichever the file already used rather than normalising it.
    const match = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]+)\3;$/.exec(line);
    if (!match) return null;
    return { kind: match[1] ? 'type' : 'value', body: match[2] ?? '', quote: match[3] ?? "'", specifier: match[4] ?? '' };
  };

  const namesAreMergeable = (body: string): string[] | null => {
    const names = body
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (names.length === 0) return null;
    // `A as B` would need to know which identifier the call site actually uses.
    if (names.some((name) => name.includes(' as '))) return null;
    return names;
  };

  for (const [index, line] of lines.entries()) {
    const parsed = clause(line);
    // Anything that is not a plain kit-specifier clause is none of this
    // transform's business.
    if (!parsed || parsed.specifier !== WEB_COMPONENT_TARGET) continue;
    const names = namesAreMergeable(parsed.body);
    if (!names) continue;

    const key = `${parsed.kind}:${parsed.specifier}:${parsed.quote}`;
    const existing = namesFor.get(key);
    if (existing) {
      existing.push(...names);
      dropped.add(index);
      continue;
    }
    namesFor.set(key, names);
    mergedInto.set(key, index);
  }

  if (dropped.size === 0) return source;

  const rebuilt = lines
    .map((line, index) => {
      if (dropped.has(index)) return null;
      for (const [key, target] of mergedInto) {
        if (target !== index) continue;
        const [kind, specifier, quote] = key.split(':', 3);
        const prefix = kind === 'type' ? 'import type' : 'import';
        const names = [...new Set(namesFor.get(key))];
        return `${prefix} { ${names.join(', ')} } from ${quote}${specifier}${quote};`;
      }
      return line;
    })
    .filter((line): line is string => line !== null);

  return rebuilt.join('\n');
}

export { mergeDuplicateImports, rewriteComponentImports, WEB_COMPONENT_MAP };
