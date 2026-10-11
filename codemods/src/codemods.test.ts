import { describe, expect, it } from 'vitest';
import { renameImports } from './rename-imports';
import { renameSymbols } from './rename-symbols';

describe('renameImports', () => {
  it('rewrites a mapped package specifier', () => {
    const result = renameImports("import { BadRequestError } from '@dav/backend-errors';", '@dav');
    expect(result.output).toBe("import { BadRequestError } from '@rexezuge/errors';");
    expect(result.changes).toStrictEqual([{ from: '@dav/backend-errors', to: '@rexezuge/errors' }]);
  });

  it('collapses the utils barrel to the package root', () => {
    const result = renameImports("import { UUIDUtil } from '@dav/shared/utils';", '@dav');
    expect(result.output).toBe("import { UUIDUtil } from '@rexezuge/shared';");
  });

  it('moves the i18n bundle to its own package', () => {
    const result = renameImports("import { SUPPORTED_LOCALES } from '@dav/shared/i18n';", '@dav');
    expect(result.output).toBe("import { SUPPORTED_LOCALES } from '@rexezuge/i18n';");
  });

  it('maps a utils subpath one-to-one onto dist', () => {
    const result = renameImports("import { X } from '@dav/shared/utils/X';", '@dav');
    expect(result.output).toBe("import { X } from '@rexezuge/shared/X';");
  });

  it('maps backend-data core modules to the d1 package', () => {
    const result = renameImports("import { executeWithRetry } from '@dav/backend-data/utils';", '@dav');
    expect(result.output).toBe("import { executeWithRetry } from '@rexezuge/d1';");
  });

  it('leaves foreign and unmapped imports untouched', () => {
    const source = "import { z } from 'zod';\nimport { webdavThing } from '@dav/webdav';";
    const result = renameImports(source, '@dav');
    expect(result.output).toBe(source);
    expect(result.changes).toStrictEqual([]);
    expect(result.unmapped).toStrictEqual([]);
  });

  it('maps the user DAOs to the identity package', () => {
    expect(renameImports("import { UserDAO } from '@dav/backend-data/dao/UserDAO';", '@dav').output).toBe(
      "import { UserDAO } from '@rexezuge/identity';",
    );
    expect(renameImports("import { encryptSecret } from '@dav/backend-data/crypto/aes-gcm';", '@dav').output).toBe(
      'import { encryptSecret } from \'@rexezuge/d1\';',
    );
  });
});

describe('renameSymbols', () => {
  it('renames this-call sites', () => {
    expect(renameSymbols('await this.withRetry(() => run(), "create user");').output).toContain('await this.run(');
    expect(renameSymbols('await this.firstWithRetry(stmt, "get user");').output).toContain('await this.first(');
  });

  it('renames constructed identifiers', () => {
    expect(renameSymbols('const config = new AppConfig(env);').output).toBe('const config = new AppConfiguration(env);');
  });

  it('renames imported names', () => {
    const source = 'import { AppConfig } from "./config";';
    expect(renameSymbols(source).output).toBe('import { AppConfiguration } from "./config";');
  });

  it('leaves same-named properties and strings alone', () => {
    const source = 'const x = { withRetry: true }; const y = "this.withRetry(";';
    expect(renameSymbols(source).output).toBe(source);
  });

  it('counts what it rewrote', () => {
    expect(renameSymbols('this.withRetry(a); this.allWithRetry(b);').changes).toBe(2);
  });
});
