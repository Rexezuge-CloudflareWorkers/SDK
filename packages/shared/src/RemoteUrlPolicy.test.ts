import { describe, expect, it } from 'vitest';
import {
  normalizeRemoteUrl,
  resolveRedirectUrl,
  parseAllowedHosts,
  isPrivateOrInternalHost,
  RemoteUrlRejectedError,
} from './RemoteUrlPolicy';

// Adapted from Durable-DAV's test/replication-url-policy.test.ts, plus cases for
// the merged SsrfHosts predicate.
function rejects(raw: string, allowedHosts: string[] = []): void {
  expect(() => normalizeRemoteUrl(raw, { allowedHosts })).toThrow(RemoteUrlRejectedError);
}

describe('normalizeRemoteUrl — accepted', () => {
  it('accepts a public https URL and canonicalises it', () => {
    expect(normalizeRemoteUrl('https://dav.example.com/files/me')).toBe('https://dav.example.com/files/me');
  });
  it('strips the query and fragment', () => {
    expect(normalizeRemoteUrl('https://dav.example.com/files?x=1#frag')).toBe('https://dav.example.com/files');
  });
  it('preserves an explicit port 443', () => {
    expect(normalizeRemoteUrl('https://dav.example.com:443/files')).toBe('https://dav.example.com/files');
  });
  it('accepts a host on the operator allowlist regardless of its address', () => {
    expect(normalizeRemoteUrl('https://nextcloud.lan/files', { allowedHosts: ['nextcloud.lan'] })).toBe('https://nextcloud.lan/files');
    expect(normalizeRemoteUrl('https://box.internal/files', { allowedHosts: ['.internal'] })).toBe('https://box.internal/files');
  });
});

describe('normalizeRemoteUrl — rejected', () => {
  it('rejects non-https schemes', () => {
    rejects('http://dav.example.com/files');
    rejects('ftp://dav.example.com/files');
    rejects('file:///etc/passwd');
  });
  it('rejects embedded credentials and a non-default port', () => {
    rejects('https://user:pass@dav.example.com/files');
    rejects('https://dav.example.com:8443/files');
  });
  it('rejects loopback in every spelling', () => {
    rejects('https://127.0.0.1/files');
    rejects('https://127.1.2.3/files');
    rejects('https://localhost/files');
    rejects('https://[::1]/files');
    rejects('https://[::]/files');
    rejects('https://2130706433/files');
    rejects('https://0x7f000001/files');
    rejects('https://0x7f.1/files');
  });
  it('rejects the cloud metadata endpoint and private ranges', () => {
    rejects('https://169.254.169.254/latest/meta-data/');
    rejects('https://10.0.0.5/files');
    rejects('https://172.16.0.1/files');
    rejects('https://192.168.1.1/files');
    rejects('https://100.64.0.1/files');
  });
  it('allows 172.32.x — outside RFC 1918 and genuinely routable', () => {
    expect(() => normalizeRemoteUrl('https://172.32.0.1/files')).not.toThrow();
  });
  it('rejects IPv6 unique-local, link-local and IPv4-mapped forms', () => {
    rejects('https://[fd00::1]/files');
    rejects('https://[fe80::1]/files');
    rejects('https://[::ffff:127.0.0.1]/files');
    rejects('https://[::ffff:10.0.0.1]/files');
  });
  it('rejects local-only suffixes and single-label hosts', () => {
    rejects('https://nas.local/files');
    rejects('https://db.internal/files');
    rejects('https://intranet/files');
  });
  it('rejects a non-string, empty or over-long value', () => {
    rejects('');
    rejects(undefined as unknown as string);
    rejects(`https://dav.example.com/${'a'.repeat(2100)}`);
  });
  it('names the offending host in the message', () => {
    expect(() => normalizeRemoteUrl('https://127.0.0.1/files')).toThrow(/127\.0\.0\.1/);
    expect(() => normalizeRemoteUrl('http://dav.example.com/')).toThrow(/https/);
  });
});

describe('resolveRedirectUrl', () => {
  it('follows a same-host redirect without re-running the whole policy', () => {
    expect(resolveRedirectUrl('https://dav.example.com/a', '/b')).toBe('https://dav.example.com/b');
  });
  it('re-validates every hop', () => {
    expect(() => resolveRedirectUrl('https://dav.example.com/a', 'https://169.254.169.254/')).toThrow(RemoteUrlRejectedError);
    expect(() => resolveRedirectUrl('https://dav.example.com/a', 'http://dav.example.com/b')).toThrow(RemoteUrlRejectedError);
  });
  it('permits a cross-host redirect to an allowlisted host', () => {
    expect(resolveRedirectUrl('https://dav.example.com/a', 'https://nextcloud.lan/b', { allowedHosts: ['nextcloud.lan'] })).toBe(
      'https://nextcloud.lan/b',
    );
  });
});

describe('parseAllowedHosts', () => {
  it('returns an empty list for unset or blank input', () => {
    expect(parseAllowedHosts(undefined)).toEqual([]);
    expect(parseAllowedHosts('')).toEqual([]);
  });
  it('splits, trims, and drops empty entries', () => {
    expect(parseAllowedHosts('a.example.com, .internal ,b.example.com')).toEqual(['a.example.com', '.internal', 'b.example.com']);
    expect(parseAllowedHosts('a.example.com,,')).toEqual(['a.example.com']);
  });
});

describe('isPrivateOrInternalHost (merged SsrfHosts predicate)', () => {
  it('refuses loopback, RFC1918, CGNAT, link-local and mapped forms', () => {
    for (const host of [
      '127.0.0.1',
      'localhost',
      'foo.localhost',
      '0.0.0.0',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '169.254.169.254',
      '::1',
      'fe80::1',
      'fd00::1',
      '[::ffff:127.0.0.1]',
      'nas.local',
      'db.internal',
      'router.home.arpa',
    ]) {
      expect(isPrivateOrInternalHost(host), host).toBe(true);
    }
  });

  it('refuses obfuscated numeric hostnames', () => {
    for (const host of ['2130706433', '0x7f000001', '0177.0.0.1', '0x7f.1']) {
      expect(isPrivateOrInternalHost(host), host).toBe(true);
    }
  });

  it("refuses an empty host and a bare ':'-bearing host", () => {
    expect(isPrivateOrInternalHost('')).toBe(true);
  });

  it('allows public hosts, including a trailing dot and a public IPv6 literal', () => {
    for (const host of ['dav.example.com', 'example.com.', '8.8.8.8', '172.32.0.1', '2001:4860:4860::8888']) {
      expect(isPrivateOrInternalHost(host), host).toBe(false);
    }
  });
});
