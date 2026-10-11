/**
 * Minimal SQL statement splitter for SQLite migration files.
 *
 * Provenance: `test/integration/helpers/migrations.ts`, byte-near-identical in
 * six consumer repos, ported here verbatim because its comment-level history is
 * the specification for the edge cases (`''` escapes, block comments, trigger
 * bodies with semicolons). The kit keeps one copy: `@rexezuge/tooling`'s
 * integration helper and `@rexezuge/identity`'s migration applier both delegate
 * to this module, so the splitter cannot drift between them.
 *
 * Handles: single/double/backtick quoted strings (incl. `''` escapes), `--`
 * line comments, block comments. Semicolons inside strings or comments do not
 * split. Statements come back trimmed, without the terminating semicolon, and
 * with their leading comments attached — use `executableStatements` to drop
 * comment-only runs before sending anything to D1.
 *
 * Trigger-aware: `CREATE TRIGGER ... BEGIN ...; ... END;` bodies contain
 * semicolons that must not split. The splitter tracks the outermost BEGIN/END
 * depth after a CREATE TRIGGER header and only splits on the terminating
 * semicolon after the final END.
 */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inTrigger = false;
  let triggerDepth = 0;
  let word = '';
  const recentKeywords: string[] = [];

  const flushWord = (): void => {
    if (word.length === 0) return;
    const upper = word.toUpperCase();
    word = '';
    recentKeywords.push(upper);
    if (recentKeywords.length > 6) recentKeywords.shift();
    // `CREATE [TEMP|TEMPORARY] TRIGGER` opens a body; a table merely named
    // "trigger" (`CREATE TABLE trigger`) must not. The word before TRIGGER
    // disambiguates.
    if (upper === 'TRIGGER' && ['CREATE', 'TEMP', 'TEMPORARY'].includes(recentKeywords.at(-2) ?? '')) {
      inTrigger = true;
      triggerDepth = 0;
    } else if (inTrigger && upper === 'BEGIN') {
      triggerDepth += 1;
    } else if (inTrigger && upper === 'END') {
      triggerDepth -= 1;
      if (triggerDepth <= 0) {
        inTrigger = false;
        triggerDepth = 0;
      }
    }
  };

  let index = 0;
  while (index < sql.length) {
    const char = sql[index] as string;
    const next = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      index += 1;
      continue;
    }
    if (inBlockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 2;
        inBlockComment = false;
        continue;
      }
      index += 1;
      continue;
    }
    if (inString) {
      current += char;
      if (char === stringChar) {
        // SQL escapes a quote by doubling it ('it''s'); do not end the string.
        if (sql[index + 1] === stringChar) {
          current += sql[index + 1];
          index += 2;
          continue;
        }
        if (sql[index - 1] !== '\\') inString = false;
      }
      index += 1;
      continue;
    }
    // Buffer word characters for CREATE TRIGGER / BEGIN / END tracking.
    // Any other character ends the current word.
    if (/[\w$]/.test(char)) {
      word += char;
      current += char;
      index += 1;
      continue;
    }
    flushWord();
    if (char === '-' && next === '-') {
      inLineComment = true;
      current += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      current += char;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      current += char;
      index += 1;
      continue;
    }
    if (char === ';') {
      // Semicolons inside a trigger body do not terminate the statement.
      if (inTrigger) {
        current += char;
        index += 1;
        continue;
      }
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

/**
 * Whether a statement is executable SQL rather than a comment.
 *
 * Checked after the split, because the splitter has to keep comments attached to
 * the statement they sit above — dropping them there would change what an error
 * message quotes.
 */
function isExecutable(statement: string): boolean {
  const withoutComments = statement
    .replaceAll(/--[^\n]*/g, '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return withoutComments.trim().length > 0;
}

/**
 * The executable statements of one migration file, in order: split first, then
 * filtered. A splitter that dropped comments itself would also drop the ones a
 * migration keeps beside the statement they describe.
 */
function executableStatements(sql: string): string[] {
  return splitSql(sql).filter(isExecutable);
}

export { executableStatements, isExecutable, splitSql };
