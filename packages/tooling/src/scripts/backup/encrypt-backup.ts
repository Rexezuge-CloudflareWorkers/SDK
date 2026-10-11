#!/usr/bin/env tsx
/**
 * Compress and encrypt the exported D1 dump.
 *
 * Provenance: Edge-Sonic's `scripts/backup/encrypt-backup.ts`, converged with the
 * AES-GCM envelope every repo in the family already uses for its secrets. This is
 * the one backup script that ported cleanly and changed *for the better* on the way
 * in: the source shelled out to `openssl enc -aes-256-cbc -pbkdf2`, which is a
 * password-derived key with a KDF whose cost is a constant somebody chose once,
 * and which is not authenticated — a flipped byte in the ciphertext is undetectable.
 *
 * The kit's version uses `@rexezuge/d1`'s `encryptSecret`, the same WebCrypto
 * AES-256-GCM primitive the workers use, over a base64 32-byte key — the same key
 * format `resolveReplicationKey` reads. One definition of "what an encryption key
 * looks like" across the deploy path and the backup path is the point: a second
 * implementation is how a deploy ends up generating something the worker cannot
 * read, and here it would be how a backup ends up unreadable by the restore path.
 *
 * Fail-closed: without `BACKUP_ENCRYPTION_KEY` the script refuses to run and
 * deletes nothing, so an unencrypted dump can never reach the artifact store the
 * upload jobs read from.
 *
 * The passphrase is read from the environment rather than passed as an argument,
 * because command-line arguments are visible to any process on the runner via `ps`.
 *
 * Emits the resulting file name as the `file` step output.
 *
 * Usage, from the repo root (after `wrangler d1 export … --output=backup.sql`):
 *
 * ```bash
 * BACKUP_ENCRYPTION_KEY=… pnpm exec tsx scripts/backup/encrypt-backup.ts
 * ```
 */

import { encryptSecret } from '@rexezuge/d1';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fail, setOutput } from '../lib/github-actions';
import { backupFileName } from './naming';

/** The dump the export step leaves in the working directory. */
const SOURCE_FILE = 'backup.sql';

/**
 * xz preset 6, chosen for ratio over speed: this runs once a day against a dump
 * that is mostly SQL text and JSON blobs, and LZMA typically beats gzip by 20-30%
 * there. `-T0` uses every available thread, which matters because xz is markedly
 * slower than gzip and the job is wall-clock bound.
 */
const XZ_ARGS = ['-T0', '-6'];

function run(command: string, args: readonly string[]): void {
  execFileSync(command, [...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

if (!process.env['BACKUP_ENCRYPTION_KEY']) {
  fail('BACKUP_ENCRYPTION_KEY is not set. Refusing to export an unencrypted database.');
}

if (!existsSync(SOURCE_FILE)) {
  fail(`Expected ${SOURCE_FILE} from the export step, but it does not exist.`);
}

const key = process.env['BACKUP_ENCRYPTION_KEY'] as string;
const file = backupFileName(new Date());

let plaintext: string;
try {
  plaintext = readFileSync(SOURCE_FILE, 'utf8');
} catch (error: unknown) {
  fail(`Could not read ${SOURCE_FILE}: ${error instanceof Error ? error.message : String(error)}`);
}

if (plaintext === '') {
  fail(`${SOURCE_FILE} is empty. An empty dump is not a backup, and uploading one is a false sense of safety.`);
}

/**
 * Compress first, then encrypt.
 *
 * The order matters: compression over ciphertext buys nothing, and encrypting the
 * compressed bytes means the plaintext is never re-materialised on disk at full
 * size. Unlike gzip, xz leaves its input in place, so the plaintext SQL has to be
 * removed explicitly here or it survives into the artifact store.
 */
let compressed: Buffer;
try {
  compressed = execFileSync('xz', [...XZ_ARGS, '--keep', '--stdout', SOURCE_FILE], { maxBuffer: 512 * 1024 * 1024 });
} catch (error: unknown) {
  fail(`xz failed on ${SOURCE_FILE}: ${error instanceof Error ? error.message : String(error)}`);
}

let envelope: { ciphertext: string; iv: string };
try {
  envelope = await encryptSecret(compressed.toString('base64'), key);
} catch (error: unknown) {
  // A key that is not 32 base64 bytes, or not valid base64 at all, fails here
  // rather than producing a file nothing can open.
  fail(`Could not encrypt the dump: ${error instanceof Error ? error.message : String(error)}`);
}

writeFileSync(file, `${JSON.stringify({ ...envelope, source: basename(SOURCE_FILE) }, null, 2)}\n`, 'utf8');
rmSync(SOURCE_FILE, { force: true });

console.log(`Backup encrypted: ${file} (${compressed.byteLength} compressed bytes)`);
setOutput('file', file);
