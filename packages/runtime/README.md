# @rexezuge/runtime

DI container, configuration, worker bases, logger, and KV cache for Cloudflare Workers.

Zero dependencies (the one platform import is type-only, resolved through each consumer's generated wrangler types).

```bash
pnpm add @rexezuge/runtime
```

---

## 1. DI — `Container` / `Token` / `RequestScope`

Minimal by design: factory + singleton scopes, branded tokens for inference, nothing else.

```ts
import { Container, type Token } from '@rexezuge/runtime';

interface Mailer { send(to: string): Promise<void> }
const MailerToken: Token<Mailer> = 'Mailer';

const root = new Container().bindValue(MailerToken, new SmtpMailer());
const mailer = root.get(MailerToken); // Mailer, no explicit generic needed
```

Composition roots wire implementations once; request handlers resolve via `asScopedContext` / `getRequestScope` rather than passing a container through business logic.

## 2. Config — `AppConfiguration` / `EnvParser`

Consumers subclass `AppConfiguration` and compose their own typed sections (limits, auth, replication), each reading env once through `EnvParser`:

```ts
import { AppConfiguration, EnvParser } from '@rexezuge/runtime';

class MyConfig extends AppConfiguration {
  public getPageSize(): number {
    return EnvParser.number(this.raw(), 'PAGE_SIZE', 50);
  }
}

const config = MyConfig.fromEnv(env);
for (const warning of config.validate()) console.warn(warning); // warnings, never throws
```

`getSiteUrl()` strips trailing slashes so callers can concatenate paths. `validate()` returns startup warnings (e.g. `DEMO_MODE` in production) instead of throwing a 500 on a request path.

## 3. Worker bases

| Base | Extends for |
| --- | --- |
| `AbstractEntrypointWorker` | HTTP + cron entrypoints (`onRequest` / `onScheduled`) |
| `AbstractDurableObjectWorker` | Durable Object workers |
| `AbstractQueueWorker` | Queue consumers |
| `AbstractWorkflowWorker` | Workflows |

`fetch()` / `scheduled()` log-and-contain: an unhandled throw is a 500 response or a logged cron failure, never a platform crash. There is deliberately no `/__scheduled` HTTP branch — cron runs through the wrangler `triggers.crons` binding. The structural `WorkerExecutionContext` / `WorkerScheduledController` types mean this package typechecks without `@cloudflare/workers-types`.

## 4. Logger and KV cache

```ts
import { createLogger, KvCache } from '@rexezuge/runtime';

const logger = createLogger('Sync', 'my-repo', env); // level from env.LOG_LEVEL ?? process.env, defaults to info
logger.info('starting sync');

const cache = new KvCache(env.CACHE); // fail-soft: reads null, writes false, D1/DO stay authoritative
await cache.putText('session', 'sess:abc', 'payload', { ttlSeconds: 300 });
```

`KV_DOMAINS` / `buildKvKey` / `clampTtl` keep every repo's key shapes and TTL ceilings identical.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/runtime exec tsc -p tsconfig.json
pnpm --filter @rexezuge/runtime typecheck
pnpm --filter @rexezuge/runtime test
```
