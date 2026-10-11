# @rexezuge/d1

D1 retry engine, error classifier, `BaseDAO`, SQL splitter, and AES-GCM envelope.

Depends on `@rexezuge/errors` (failures surface as `DatabaseError` with the classifier's verdict in `retryable`) and `@rexezuge/shared` (base64 for the crypto envelope).

```bash
pnpm add @rexezuge/d1
```

---

## 1. Retry engine

One engine, one schedule — the seven consumer repos each spelled this differently, and divergent schedules were the drift:

```ts
import { D1_RETRY_DEFAULTS, executeWithRetry } from '@rexezuge/d1';

const row = await executeWithRetry((db) => db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first(), {
  maxRetries: D1_RETRY_DEFAULTS.maxRetries, // 3, exponential backoff from 100ms via backoffMs()
});
```

Both D1 failure shapes are handled: a resolved `success: false` result and a thrown transport error are classified from the message the same way (`isD1ErrorRetryable` / `RETRYABLE_PATTERNS` / `NON_RETRYABLE_PATTERNS`). `BaseDAO` is the intended caller; call it directly only for statements outside a DAO.

## 2. `BaseDAO` and types

```ts
import { BaseDAO, assertSqlIdentifier } from '@rexezuge/d1';

class UserDAO extends BaseDAO {
  public getById(id: string) {
    return this.first('SELECT * FROM users WHERE id = ?', [id]);
  }
}
```

`BaseDAO` wraps every statement in the retry engine. `D1Queryable` / `D1PreparedStatement` / `D1Result` are structural types, so fakes, Miniflare, and real D1 bindings all satisfy them. `assertSqlIdentifier` guards the one thing bindings cannot parameterize — table/column names.

## 3. SQL splitting and schema errors

```ts
import { executableStatements, isMissingSchemaError, splitSql } from '@rexezuge/d1';

const statements = executableStatements(migrationSql); // trigger-aware; comments/stripped, one batch per file
try {
  await dao.get(normalized);
} catch (error: unknown) {
  if (isMissingSchemaError(error)) return null; // migration hasn't run — the only safe fall-through
  throw error; // every other failure is an outage, never a silent null
}
```

`splitSql` / `isExecutable` power both migrations and `@rexezuge/tooling`'s integration-migration test helper, so a kit migration and a test suite can never disagree about where one statement ends.

## 4. AES-GCM secrets

```ts
import { decryptSecret, encryptSecret } from '@rexezuge/d1';

const { ciphertext, iv } = await encryptSecret(clientSecret, env.BACKUP_ENCRYPTION_KEY); // store the pair
const cleartext = await decryptSecret(ciphertext, iv, env.BACKUP_ENCRYPTION_KEY);
```

Key material is base64 of exactly 32 bytes; a missing or wrong-sized key throws `AesGcmKeyError` rather than storing the secret in the clear. The IV is random per call — reusing one under a key destroys GCM's guarantees, which is why it is returned alongside the ciphertext instead of being internal.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/d1 exec tsc -p tsconfig.json
pnpm --filter @rexezuge/d1 typecheck
pnpm --filter @rexezuge/d1 test
```
