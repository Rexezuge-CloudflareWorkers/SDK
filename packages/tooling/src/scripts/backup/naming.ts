/**
 * Backup artifact naming and retention-window handling.
 *
 * Provenance: Edge-Sonic's `scripts/backup/naming.ts` and `retention.ts`,
 * converged into one module because the two answer the same question from either
 * side — what a file is called, and which of them are still worth keeping — and a
 * consumer only ever imports one.
 */

/**
 * The filename prefix.
 *
 * Exported rather than inlined, because the workflow uploads with
 * `<prefix>_*.sql.xz.enc` and `if-no-files-found: error`. That glob and this prefix
 * are one fact written in two places — the failure mode being a rename here that
 * silently stops every upload while each upload job still reports success, since
 * the upload jobs skip on `needs` rather than failing.
 */
export const BACKUP_FILE_PREFIX = 'backup_prod_';

/**
 * `2026-10-01_04-15-00` — sortable, filename-safe, and UTC.
 *
 * UTC rather than local: a retention window computed across a DST boundary is one
 * day wide in one direction, and a backup pruned a day early is a backup that was
 * never needed.
 */
export function backupStamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 19).replaceAll(':', '-')}`;
}

/** The full artifact name: `<prefix><stamp>.sql.xz.enc`. */
export function backupFileName(date: Date): string {
  return `${BACKUP_FILE_PREFIX}${backupStamp(date)}.sql.xz.enc`;
}

/**
 * `YYYY-MM-DD`, `days` before `now`.
 */
export function retentionCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Read `BACKUP_RETENTION_DAYS` from the environment, rejecting bad values.
 *
 * Rejected rather than defaulted: silently falling back would either prune
 * everything or keep backups forever, and both are worse than a failed run that
 * names the problem.
 *
 * `Number()` rather than `parseInt()`: `parseInt('30d')` yields 30, which would
 * silently accept a mistyped value and prune against the wrong window.
 */
export function requireRetentionDays(): number {
  const raw = process.env['BACKUP_RETENTION_DAYS'];
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`BACKUP_RETENTION_DAYS must be a positive number, got ${JSON.stringify(raw)}.`);
  }
  return days;
}
