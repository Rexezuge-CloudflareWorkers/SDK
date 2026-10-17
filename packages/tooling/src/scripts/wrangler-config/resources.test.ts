import { describe, expect, it } from 'vitest';
import { ensureRequiredKvBindings, getKVNamespaceName, getRequiredKvBindings } from './resources.ts';
import type { WranglerConfig } from './types.ts';

describe('getRequiredKvBindings', () => {
  it('defaults to the CACHE binding every deployment needs', () => {
    expect(getRequiredKvBindings()).toEqual(['CACHE']);
  });

  it('takes the bindings from the map it is given', () => {
    expect(getRequiredKvBindings({ RECORD_CACHE: 'record-provider-record-cache' })).toEqual(['RECORD_CACHE']);
  });

  it('treats an explicitly empty map as needing no bindings', () => {
    expect(getRequiredKvBindings({})).toEqual([]);
  });
});

describe('getKVNamespaceName', () => {
  it('derives a name from the worker and binding when the map does not list it', () => {
    expect(getKVNamespaceName({ name: 'records-provider' }, 'RECORD_CACHE')).toBe('records-provider-record_cache');
  });

  it('uses the name the map gives', () => {
    const namespaceNames = { RECORD_CACHE: 'record-provider-record-cache' };
    expect(getKVNamespaceName({ name: 'records-provider' }, 'RECORD_CACHE', namespaceNames)).toBe('record-provider-record-cache');
  });
});

describe('ensureRequiredKvBindings', () => {
  it('adds the bindings from the caller’s map rather than the default CACHE binding', () => {
    // The regression: a repo that binds RECORD_CACHE to an existing namespace
    // must not have a stray CACHE added, whose provisioning would create an
    // empty namespace and leave the record data unread.
    const patched = ensureRequiredKvBindings(
      '{\n  "kv_namespaces": []\n}',
      { kv_namespaces: [] },
      { RECORD_CACHE: 'record-provider-record-cache' },
    );
    const bindings = (JSON.parse(patched) as WranglerConfig).kv_namespaces?.map((namespace) => namespace.binding);
    expect(bindings).toEqual(['RECORD_CACHE']);
  });

  it('adds the default binding when no map is given', () => {
    const patched = ensureRequiredKvBindings('{\n  "kv_namespaces": []\n}', { kv_namespaces: [] });
    const bindings = (JSON.parse(patched) as WranglerConfig).kv_namespaces?.map((namespace) => namespace.binding);
    expect(bindings).toEqual(['CACHE']);
  });
});
