import { describe, expect, it } from 'vitest';
import { executableStatements, splitSql } from './splitSql';

describe('splitSql', () => {
  // Statements come back trimmed, without the trailing semicolon: the splitter
  // folds leading comments into the statement and executableStatements removes
  // comment-only ones.
  it('splits on semicolons outside strings and comments', () => {
    expect(splitSql('SELECT 1; SELECT 2;')).toStrictEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps semicolons inside quoted strings', () => {
    expect(splitSql("INSERT INTO t VALUES ('a;b');")).toStrictEqual(["INSERT INTO t VALUES ('a;b')"]);
  });

  it('keeps doubled-quote escapes inside strings', () => {
    expect(splitSql("INSERT INTO t VALUES ('it''s; fine');")).toStrictEqual(["INSERT INTO t VALUES ('it''s; fine')"]);
  });

  it('does not split inside a CREATE TRIGGER body', () => {
    const sql = 'CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE y SET a = 1; UPDATE y SET b = 2; END;';
    expect(splitSql(sql)).toStrictEqual(['CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE y SET a = 1; UPDATE y SET b = 2; END']);
  });

  it('does not confuse a table named trigger with a trigger body', () => {
    expect(splitSql('CREATE TABLE trigger (a TEXT);')).toStrictEqual(['CREATE TABLE trigger (a TEXT)']);
  });

  it('tracks nested BEGIN/END depth in a trigger body', () => {
    const sql = 'CREATE TRIGGER t BEGIN BEGIN UPDATE y SET a = 1; END; UPDATE y SET b = 2; END;';
    expect(splitSql(sql)).toStrictEqual(['CREATE TRIGGER t BEGIN BEGIN UPDATE y SET a = 1; END; UPDATE y SET b = 2; END']);
  });
});

describe('executableStatements', () => {
  it('drops comment-only statements the splitter folded in', () => {
    const sql = '-- a note about the migration;\nCREATE TABLE a (id TEXT);\n/* trailing block */;';
    expect(splitSql(sql)).toStrictEqual(['-- a note about the migration;\nCREATE TABLE a (id TEXT)', '/* trailing block */']);
    expect(executableStatements(sql)).toStrictEqual(['-- a note about the migration;\nCREATE TABLE a (id TEXT)']);
  });
});
