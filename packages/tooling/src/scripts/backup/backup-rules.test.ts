import { describe, expect, it } from 'vitest';
import { resolveD1Target } from './d1-target.ts';
import { evaluateConfig } from './destination-config.ts';
import { backupFileName, backupStamp, requireRetentionDays, retentionCutoff } from './naming.ts';

describe('resolveD1Target', () => {
  it('prefers database_name, falling back to the binding', () => {
    // `wrangler d1 export` takes a database *name*, so the name wins when present.
    expect(resolveD1Target({ d1_databases: [{ binding: 'DB', database_name: 'my-db', database_id: 'abc' }] })).toStrictEqual({
      binding: 'DB',
      databaseId: 'abc',
      target: 'my-db',
    });
    expect(resolveD1Target({ d1_databases: [{ binding: 'DB', database_id: 'abc' }] }).target).toBe('DB');
  });

  it('refuses a placeholder id, because the database was never created', () => {
    expect(() => resolveD1Target({ d1_databases: [{ binding: 'DB', database_id: '00000000-0000-0000-0000-000000000000' }] })).toThrow(
      /template placeholder/,
    );
  });

  it('refuses a config with no binding to export under', () => {
    expect(() => resolveD1Target({ d1_databases: [{ database_id: 'abc' }] })).toThrow(/No d1_databases entry with a binding/);
    expect(() => resolveD1Target({})).toThrow(/No d1_databases entry with a binding/);
  });
});

describe('evaluateConfig', () => {
  it('stays silent when nothing is configured', () => {
    // An unconfigured repository is a legitimate "I do not want off-site backups"
    // state and must not turn the schedule red.
    expect(evaluateConfig({})).toMatchObject({ cloudflare: false, encryption: false, anyDestination: false, errors: [] });
  });

  it('fails closed on a destination without an encryption key', () => {
    const config = evaluateConfig({
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_BUCKET: 'bucket',
    });
    expect(config.s3).toBe(true);
    expect(config.encryption).toBe(false);
    expect(config.errors.join('\n')).toMatch(/BACKUP_ENCRYPTION_KEY is required/);
  });

  it('fails a destination with no Cloudflare credentials', () => {
    expect(
      evaluateConfig({ BACKUP_ENCRYPTION_KEY: 'k', WEBDAV_URL: 'https://dav.example.com', WEBDAV_USER: 'u', WEBDAV_PASSWORD: 'p' }).errors,
    ).toStrictEqual(['A backup destination is configured but CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are missing.']);
  });

  it('passes when both a destination and the key are present', () => {
    const config = evaluateConfig({
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      BACKUP_ENCRYPTION_KEY: 'key',
      WEBDAV_URL: 'https://dav.example.com',
      WEBDAV_USER: 'u',
      WEBDAV_PASSWORD: 'p',
    });
    expect(config.errors).toStrictEqual([]);
    expect(config.webdav).toBe(true);
    expect(config.s3).toBe(false);
  });

  it('treats whitespace-only secrets as absent', () => {
    expect(evaluateConfig({ S3_ACCESS_KEY_ID: ' '.repeat(3), S3_SECRET_ACCESS_KEY: ' ', S3_BUCKET: '\t' }).s3).toBe(false);
  });
});

describe('naming', () => {
  it('names the artifact sortably, in UTC', () => {
    // UTC rather than local: a retention window computed across a DST boundary is
    // one day wide in one direction, and a backup pruned a day early is a backup
    // that was never needed.
    const stamp = backupStamp(new Date('2026-10-01T04:15:00.000Z'));
    expect(stamp).toBe('2026-10-01_04-15-00');
    expect(backupFileName(new Date('2026-10-01T04:15:00.000Z'))).toBe('backup_prod_2026-10-01_04-15-00.sql.xz.enc');
  });

  it('computes a retention cutoff as a date, days back', () => {
    expect(retentionCutoff(new Date('2026-10-31T12:00:00.000Z'), 30)).toBe('2026-10-01');
  });

  it('rejects a bad retention window rather than defaulting one', () => {
    // Silently falling back would either prune everything or keep backups forever.
    const before = process.env['BACKUP_RETENTION_DAYS'];
    try {
      process.env['BACKUP_RETENTION_DAYS'] = '30d';
      expect(() => requireRetentionDays()).toThrow(/must be a positive number/);
      process.env['BACKUP_RETENTION_DAYS'] = '-1';
      expect(() => requireRetentionDays()).toThrow(/must be a positive number/);
      delete process.env['BACKUP_RETENTION_DAYS'];
      expect(() => requireRetentionDays()).toThrow(/must be a positive number/);
      process.env['BACKUP_RETENTION_DAYS'] = '30';
      expect(requireRetentionDays()).toBe(30);
    } finally {
      if (before === undefined) delete process.env['BACKUP_RETENTION_DAYS'];
      else process.env['BACKUP_RETENTION_DAYS'] = before;
    }
  });
});
