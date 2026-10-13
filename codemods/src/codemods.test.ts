import { describe, expect, it } from 'vitest';
import { mergeRules } from './mapping';
import { renameImports } from './rename-imports';
import { renameSymbols } from './rename-symbols';

describe('renameImports', () => {
  it('moves the whole backend-errors package', () => {
    const result = renameImports("import { BadRequestError } from '@dav/backend-errors';", '@dav');
    expect(result.output).toBe("import { BadRequestError } from '@rexezuge/errors';");
    expect(result.changes).toStrictEqual([{ from: '@dav/backend-errors', to: '@rexezuge/errors' }]);
  });

  it('moves shared utilities but keeps the business subtrees', () => {
    expect(renameImports("import { UUIDUtil } from '@dav/shared/utils';", '@dav').output).toBe(
      "import { UUIDUtil } from '@rexezuge/shared';",
    );
    for (const local of ['constants', 'model', 'schema']) {
      const source = `import { X } from '@dav/shared/${local}';`;
      const result = renameImports(source, '@dav');
      expect(result.output).toBe(source);
      expect(result.changes).toStrictEqual([]);
    }
  });

  it("moves Durable-DAV's shared/net URL-policy subtree", () => {
    // The kit converged DD's RemoteUrlPolicy, so `net` is a kernel subtree:
    // its barrel exports (normalizeRemoteUrl, RemoteUrlRejectedError,
    // MAX_REDIRECTS) all live at the kit's shared root.
    const result = renameImports("import { normalizeRemoteUrl } from '@dav/shared/net';", '@dav');
    expect(result.output).toBe("import { normalizeRemoteUrl } from '@rexezuge/shared';");
    expect(result.unmapped).toStrictEqual([]);
  });

  it('moves the i18n bundle to its own package', () => {
    const result = renameImports("import { SUPPORTED_LOCALES } from '@dav/shared/i18n';", '@dav');
    expect(result.output).toBe("import { SUPPORTED_LOCALES } from '@rexezuge/i18n';");
  });

  it('moves a shared utils subpath the kit converged', () => {
    // Only files the kit actually ships may move. The rules table names them
    // one by one, so this is a mapped row rather than a tail.
    const result = renameImports("import { UUIDUtil } from '@dav/shared/utils/UUIDUtil';", '@dav');
    expect(result.output).toBe("import { UUIDUtil } from '@rexezuge/shared';");
  });

  it('reports a shared utils file the kit has NOT converged instead of rewriting it', () => {
    // Regression: a one-to-one tail used to map every `shared/utils/X` onto
    // `@rexezuge/shared/X`. Edge-Git ships BranchValidation, ConcurrencyUtil,
    // GitOids, SlugValidation and SsrfHosts there; the kit has none of them, so
    // the tail produced imports of modules that do not exist.
    for (const local of ['BranchValidation', 'ConcurrencyUtil', 'GitOids', 'SlugValidation', 'SsrfHosts']) {
      const source = `import { X } from '@dav/shared/utils/${local}';`;
      const result = renameImports(source, '@dav');
      expect(result.output).toBe(source);
      expect(result.changes).toStrictEqual([]);
      expect(result.unmapped).toStrictEqual([`@dav/shared/utils/${local}`]);
    }
  });

  it('moves runtime kernel files and keeps ConfigurationManager, http and constants', () => {
    expect(
      renameImports("import { AbstractEntrypointWorker } from '@dav/backend-runtime/base/AbstractEntrypointWorker';", '@dav').output,
    ).toBe("import { AbstractEntrypointWorker } from '@rexezuge/runtime';");
    expect(renameImports("import { EnvParser } from '@dav/backend-runtime/config/EnvParser';", '@dav').output).toBe(
      "import { EnvParser } from '@rexezuge/runtime';",
    );
    for (const local of ['config/ConfigurationManager', 'http', 'constants']) {
      const source = `import { X } from '@dav/backend-runtime/${local}';`;
      const result = renameImports(source, '@dav');
      expect(result.output).toBe(source);
      expect(result.changes).toStrictEqual([]);
      expect(result.unmapped).toStrictEqual([]);
    }
  });

  it('moves the backend-data kernel and keeps the business DAOs', () => {
    expect(renameImports("import { executeD1WithRetry } from '@dav/backend-data/utils';", '@dav').output).toBe(
      "import { executeD1WithRetry } from '@rexezuge/d1';",
    );
    expect(renameImports("import { isD1ErrorRetryable } from '@dav/backend-data/utils/D1ErrorClassifier';", '@dav').output).toBe(
      "import { isD1ErrorRetryable } from '@rexezuge/d1';",
    );
    expect(renameImports("import { encryptSecret } from '@dav/backend-data/crypto/aes-gcm';", '@dav').output).toBe(
      "import { encryptSecret } from '@rexezuge/d1';",
    );
    // The barrel and the business DAOs stay: this repo's backend-data survives.
    for (const local of ['/dao', '/dao/CalDavCredentialDAO', '/crypto', '/utils/D1SessionUtil']) {
      const source = `import { X } from '@dav/backend-data${local}';`;
      const result = renameImports(source, '@dav');
      expect(result.output).toBe(source);
      expect(result.changes).toStrictEqual([]);
      expect(result.unmapped).toStrictEqual([]);
    }
  });

  it('moves the identity DAOs out of backend-data onto @rexezuge/identity', () => {
    // `backend-data` has `default: null`, which would park these as "stays
    // local" forever. They are converged code, so they move.
    for (const moved of ['/dao/UserDAO', '/dao/UserEmailDAO', '/dao/identity']) {
      expect(renameImports(`import { X } from '@dav/backend-data${moved}';`, '@dav').output).toBe(
        `import { X } from '@rexezuge/identity';`,
      );
    }
  });

  it('reports an unruled subpath inside a rules package', () => {
    // shared has no `default` rule, so an unknown subpath is a decision the
    // operator has to make, not one the codemod can guess.
    const result = renameImports("import { X } from '@dav/shared/weird';", '@dav');
    expect(result.unmapped).toStrictEqual(['@dav/shared/weird']);
    expect(result.changes).toStrictEqual([]);
  });

  it('leaves foreign and business-package imports untouched', () => {
    const source = "import { z } from 'zod';\nimport { CalendarService } from '@dav/backend-services';\nimport { x } from '@dav/webdav';";
    const result = renameImports(source, '@dav');
    expect(result.output).toBe(source);
    expect(result.changes).toStrictEqual([]);
    expect(result.unmapped).toStrictEqual([]);
  });
});

describe('renameSymbols', () => {
  it('renames the i18n barrel onto the kit names', () => {
    // The kit's canonical locale table; a repo keeping its own BACKEND_STRINGS
    // would be a second source of truth for the parity tests.
    const source = "import { BACKEND_STRINGS, getBackendStrings } from '@rexezuge/i18n';\nconst strings = getBackendStrings('en');";
    const result = renameSymbols(source);
    expect(result.output).toContain("import { LOCALE_STRINGS, getLocalizedStrings } from '@rexezuge/i18n';");
    expect(result.output).toContain("getLocalizedStrings('en')");
    expect(result.changes).toBeGreaterThanOrEqual(3);
  });

  it('renames this-call sites', () => {
    expect(renameSymbols('await this.withRetry(() => run(), "create user");').output).toContain('await this.run(');
    expect(renameSymbols('await this.firstWithRetry(stmt, "get user");').output).toContain('await this.first(');
  });

  it('renames constructed identifiers', () => {
    expect(renameSymbols('const config = new AppConfig(env);').output).toBe('const config = new AppConfiguration(env);');
  });

  it('renames imported names', () => {
    expect(renameSymbols('import { AppConfig } from "./config";').output).toBe('import { AppConfiguration } from "./config";');
  });

  it('leaves a static-namespace class its callers use untouched', () => {
    // ConfigurationManager stays in repos that kept it as a static namespace;
    // only its `new`/import forms are rename candidates, and there are none.
    const source = 'const minutes = ConfigurationManager.oauth2.getStateExpiryMinutes(env);';
    expect(renameSymbols(source).output).toBe(source);
  });

  it('leaves same-named properties and strings alone', () => {
    const source = 'const x = { withRetry: true }; const y = "this.withRetry(";';
    expect(renameSymbols(source).output).toBe(source);
  });

  it('counts what it rewrote', () => {
    expect(renameSymbols('this.withRetry(a); this.allWithRetry(b);').changes).toBe(2);
  });

  it('leaves the local DI vocabulary alone', () => {
    // Regression: `Provider` and `ServiceContext` were once mapped to
    // `RequestScope`, which `@rexezuge/runtime` does not export — it exports the
    // setRequestScope/getRequestScope/asScopedContext *functions*. Both names
    // are a consumer's own DI types and stay local.
    const source = [
      "import { Provider } from './Provider';",
      'function build(): Provider<Dao> { return async () => new Dao(); }',
      "import type { ServiceContext } from './ServiceContext';",
      'const ctx: ServiceContext = createServiceContext(env);',
    ].join('\n');
    expect(renameSymbols(source).output).toBe(source);
  });

  it('renames the identity service methods onto their account-named forms', () => {
    const source = 'const a = await this.resolveUserId(email);\nconst b = await this.resolveUserById(id);';
    const result = renameSymbols(source);
    expect(result.output).toContain('this.resolveAccountId(email)');
    expect(result.output).toContain('this.resolveAccountById(id)');
  });

  it('leaves the identity free function named resolveUserId', () => {
    // Regression: `IDENTITY_RENAMES` mapped `resolveUserId` to
    // `resolveAccountId` un-scoped, so an `import { resolveUserId }` became an
    // import of a symbol `@rexezuge/identity` does not export — the free
    // function keeps its name, and only the *method* is renamed. The member-only
    // table is what tells the two apart.
    const source = [
      "import { resolveUserId } from '@rexezuge/identity';",
      'const id = await resolveUserId(this.lookupDeps(), email);',
    ].join('\n');
    expect(renameSymbols(source).output).toBe(source);
  });
});

describe('consumer rule overrides', () => {
  it('parks a divergent subtree locally while keeping every other row', () => {
    // Mail-Otter's i18n bundle is ~130 product keys; the kit's locales carry a
    // 3-key `common` group, so moving the bundle would delete the product's
    // strings. The override parks that one row and inherits the rest.
    const rules = mergeRules({ subpathRules: { shared: { '/i18n': null } } });
    const result = renameImports("import { getBackendStrings } from '@ot/shared/i18n';", '@ot', rules);
    expect(result.output).toBe("import { getBackendStrings } from '@ot/shared/i18n';");
    // …and the package's other rows still apply.
    expect(renameImports("import { UUIDUtil } from '@ot/shared/utils';", '@ot', rules).output).toContain('@rexezuge/shared');
  });

  it('parks an identity DAO locally for a users table the kit does not model', () => {
    const rules = mergeRules({ identityDaoSubpaths: { '/dao/UserDAO': null } });
    const kept = renameImports("import { UserDAO } from '@ot/backend-data/dao/UserDAO';", '@ot', rules);
    expect(kept.output).toBe("import { UserDAO } from '@ot/backend-data/dao/UserDAO';");
    // The DAO that *does* match still moves.
    expect(renameImports("import { UserEmailDAO } from '@ot/backend-data/dao/UserEmailDAO';", '@ot', rules).output).toContain(
      '@rexezuge/identity',
    );
  });

  it('accepts a package the shipped tables have never heard of', () => {
    const rules = mergeRules({ subpathRules: { 'new-kernel': { '/base': '@rexezuge/runtime' } } });
    expect(renameImports("import { Base } from '@ot/new-kernel/base';", '@ot', rules).output).toContain('@rexezuge/runtime');
  });

  it('leaves the shipped tables untouched when a rule is merged', () => {
    mergeRules({ subpathRules: { shared: { '/i18n': null } } });
    // Second repo, no overrides: the default still moves the bundle.
    expect(renameImports("import { getBackendStrings } from '@ot/shared/i18n';", '@ot').output).toContain('@rexezuge/i18n');
  });

  it('honours a repo-specific symbol rename', () => {
    const rules = mergeRules({ symbolRenames: { getBaseUrl: 'origin' } });
    expect(renameSymbols("import { getBaseUrl } from './base';", rules).output).toContain('origin');
  });
});
