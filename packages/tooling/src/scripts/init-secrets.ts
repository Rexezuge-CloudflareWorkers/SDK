#!/usr/bin/env tsx
/**
 * Create the Secrets Store entries declared in `wrangler.jsonc`, generating a fresh
 * value for each one that does not exist yet.
 *
 * Provenance: Edge-Sonic's `scripts/deploy/init-secrets.ts` and Durable-DAV's
 * `scripts/init-secrets.ts`, converged. Both record the same two defects that hid
 * a broken deploy for a whole release, and both fixes are carried over.
 *
 * ### Why this script exists at all
 *
 * A `secrets_store_secrets` binding fails the deploy unless the named secret
 * already exists inside the named store. Nothing creates it: Cloudflare will not
 * generate a value, and the template cannot carry one. So this script is the only
 * thing standing between a fresh account and a deploy that cannot succeed.
 *
 * ### The two defects that hid a broken deploy
 *
 * **The generator list was stale.** Durable-DAV's copy carried an allowlist of
 * exact names from the repository it was inherited from, all deleted when the repo
 * was renamed, so the very first iteration threw `Unknown secret` and never created
 * anything. So the rule here is the secret's **name shape**, not a list of names:
 * `*-encryption-key` gets a generated AES-GCM key and `*-signing-secret` gets 32
 * random bytes. Adding a secret to the template is then a one-line change needing
 * no matching edit here, which is the property the exact-name list did not have.
 *
 * **The throw was swallowed.** The original ended in `main().catch(console.error)`.
 * `console.error` returns `undefined` and never sets an exit status, so the process
 * exited **0** and CI marked the step green — the failure only surfaced one step
 * later, as an unexplainable `wrangler deploy` failure. Hence: the whole plan is
 * validated **before** any Cloudflare call, and a rejection reaches the runner as
 * a non-zero exit with a workflow annotation.
 *
 * ### Create-if-absent is a correctness property, not laziness
 *
 * An existing secret is left untouched. A replication encryption key seals every
 * remote target's credential; regenerating it on a redeploy would strand them all
 * as undecryptable. Rotation has to be a deliberate act with a re-encrypt path,
 * not a side effect of deploying.
 *
 * Requires a materialized `wrangler.jsonc` — run
 * `scripts/prepare-wrangler-config.ts` first. Fails rather than skipping when the
 * config is missing, because a step reporting "Secret initialization complete"
 * having created nothing is worse than a named error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { fail } from './lib/github-actions.ts';
import { isEmptySecretsStoreListing, parseWranglerNames } from './lib/wrangler-table.ts';
import { CONFIG_PATH, type WranglerConfig } from './wrangler-config/types.ts';

/**
 * The secret names the AES-GCM key generator produces, matched by **shape**.
 *
 * Keyed on the suffix because the alternative is the exact-name map that went
 * stale. See the header: a template naming `*-encryption-key` is then a one-line
 * change with no matching edit here, and a new secret breaks the deploy loudly
 * instead of silently.
 */
const ENCRYPTION_KEY_SUFFIX = '-encryption-key';

/**
The secret names the random signing secret generator produces.
*/
const SIGNING_SECRET_SUFFIX = '-signing-secret';

/**
A 256-bit AES-GCM key, base64-encoded — the shape the worker's crypto layer accepts.
*/
async function generateAESGCMKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  // Chunked rather than spread: `String.fromCharCode(...bytes)` passes 32 arguments,
  // which is fine today and is a stack overflow the day the key is longer.
  let binary = '';
  for (const byte of new Uint8Array(exported)) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

/**
A 256-bit random signing secret for internal self-calls, hex-encoded.
*/
function generateSigningSecret(): Promise<string> {
  let hex = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return Promise.resolve(hex);
}

/**
 * The generator for a secret name, chosen by the name's shape.
 *
 * A name matching neither is still refused rather than given a guess: the generator
 * is not the only thing that has to be right, and an unusable value that looks
 * provisioned is worse than a failure.
 */
function generatorFor(secretName: string): () => Promise<string> {
  if (secretName.endsWith(ENCRYPTION_KEY_SUFFIX)) return generateAESGCMKey;
  if (secretName.endsWith(SIGNING_SECRET_SUFFIX)) return generateSigningSecret;
  throw new Error(
    `Unknown secret: ${secretName}. Name it '*-encryption-key' for a generated 32-byte AES-GCM key, ` +
      `or '*-signing-secret' for 32 random bytes, and teach this script the shape if neither fits.`,
  );
}

/**
Whether this script can produce a value for `secretName`.
*/
function canProvisionSecret(secretName: string): boolean {
  try {
    generatorFor(secretName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a wrangler subcommand, optionally feeding `input` on stdin.
 *
 * Arguments are passed as an argv array rather than interpolated into a shell
 * string, so a value containing shell metacharacters cannot alter the command.
 */
function wrangler(args: readonly string[], input?: string): string {
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
      encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      ...(input !== undefined && { input }),
    });
  } catch (error: unknown) {
    const maybeProcessError = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdout: string = maybeProcessError.stdout ? maybeProcessError.stdout.toString() : '';
    const stderr: string = maybeProcessError.stderr ? maybeProcessError.stderr.toString() : '';
    throw new Error(`Command failed: pnpm exec wrangler ${args.join(' ')}\n${stdout}${stderr || maybeProcessError.message || ''}`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `${CONFIG_PATH} not found. Run scripts/prepare-wrangler-config.ts first — it is what creates the file this script reads.`,
    );
  }
  // `parse` is error-tolerant and returns a partial object, so an empty result means
  // malformed JSON rather than "no secrets declared". Treating that as an empty list
  // would report success having created nothing.
  const config = parse(readFileSync(CONFIG_PATH, 'utf8')) as WranglerConfig;
  if (config.secrets_store_secrets === undefined && Object.keys(config).length === 0) {
    throw new Error(`${CONFIG_PATH} is empty or not valid JSONC. Run scripts/prepare-wrangler-config.ts to regenerate it.`);
  }
  return config;
}

/**
One secret to create, as the plan names it.
*/
interface PlannedSecret {
  storeId: string;
  secretName: string;
}

/**
 * Turn the config's bindings into a validated work list.
 *
 * Every entry is checked *before* the first Cloudflare call, so an
 * unprovisionable secret fails the step in milliseconds instead of after some other
 * secret has already been created.
 */
function planSecrets(config: WranglerConfig): PlannedSecret[] {
  const plan: PlannedSecret[] = [];
  for (const [index, secret] of (config.secrets_store_secrets ?? []).entries()) {
    const label = secret.binding ?? `index ${index}`;
    const storeId = secret.store_id;
    const secretName = secret.secret_name;
    if (storeId === undefined || storeId === '' || secretName === undefined || secretName === '') {
      throw new Error(
        `secrets_store_secrets[${index}] ("${label}") needs both store_id and secret_name; ` +
          'store_id is normally filled in by scripts/prepare-wrangler-config.ts.',
      );
    }
    if (!canProvisionSecret(secretName)) {
      throw new Error(`No generator for secret "${secretName}" (binding "${label}").`);
    }
    plan.push({ storeId, secretName });
  }
  return plan;
}

/**
 * List the secret names present in a store.
 *
 * Returns `undefined` when the listing itself failed, which is deliberately
 * distinct from an empty set: a transient CLI failure must not be read as "the
 * secret is missing" and cause a duplicate insert over a live value. An empty store
 * *is* a confirmed absence, so it maps to an empty set rather than `undefined`.
 *
 * The name is taken exactly. `output.includes(secretName)` is not a membership test:
 * `my-replication-encryption-key-2` satisfies a search for
 * `my-replication-encryption-key`, so a store holding only the suffixed entry would
 * report the unsuffixed one as already present and it would never be created.
 */
function listSecretNames(storeId: string): Set<string> | undefined {
  let output: string;
  try {
    output = wrangler(['secrets-store', 'secret', 'list', storeId, '--remote']);
  } catch (error: unknown) {
    if (isEmptySecretsStoreListing(error)) {
      console.log(`Secrets Store ${storeId} is empty`);
      return new Set();
    }
    console.warn(`Unable to list secrets in store ${storeId}:`, error instanceof Error ? error.message : 'unknown error');
    return undefined;
  }
  return parseWranglerNames(output);
}

function createSecret(storeId: string, secretName: string, secretValue: string): void {
  console.log(`Creating secret: ${secretName}`);
  // The value goes in on stdin, never as an argv entry: an argv is visible to every
  // process on the runner through `ps`, and the previous
  // `echo "${value}" | wrangler … ${name}` also broke on `"`, `$`, backticks and
  // newlines.
  wrangler(['secrets-store', 'secret', 'create', storeId, '--name', secretName, '--scopes', 'workers', '--remote'], secretValue);
}

async function main(): Promise<void> {
  console.log('Initializing Cloudflare secrets...');
  const config = parseWranglerConfig();
  const plan = planSecrets(config);

  if (plan.length === 0) {
    throw new Error('wrangler.jsonc declares no secrets_store_secrets entries, so there is nothing to initialize.');
  }

  const listedByStore = new Map<string, Set<string> | undefined>();

  for (const { storeId, secretName } of plan) {
    if (!listedByStore.has(storeId)) {
      listedByStore.set(storeId, listSecretNames(storeId));
    }
    const existing = listedByStore.get(storeId);
    if (existing === undefined) {
      // Refuse to guess: creating a secret we could not read back risks overwriting
      // a live value with a freshly generated one.
      throw new Error(`Could not list secrets in store ${storeId}; refusing to create ${secretName} without confirming it is absent.`);
    }
    if (existing.has(secretName)) {
      console.log(`Secret ${secretName} already exists; leaving it untouched.`);
      continue;
    }
    createSecret(storeId, secretName, await generatorFor(secretName)());
    existing.add(secretName);
  }

  console.log('Secret initialization complete');
}

// Top-level await rather than `.catch(console.error)`, so a rejected `main` surfaces
// as a stack trace with its cause intact and the process exits non-zero. Either way
// the exit status has to be right: this runs in the deploy pipeline, and swallowing
// the rejection reported a failed key bootstrap as a green step.
try {
  await main();
} catch (error: unknown) {
  fail(error instanceof Error ? `Secret initialization failed: ${error.message}` : String(error));
}
