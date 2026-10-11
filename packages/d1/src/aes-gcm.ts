import { base64ToBytes, bytesToBase64 } from '@rexezuge/shared';

/**
 * AES-GCM envelope for values that must be recoverable.
 *
 * Converged from the seven drifted copies of `backend-data/crypto/aes-gcm.ts`
 * (AWS, CalDAV, Durable-DAV, Edge-Git, Edge-Sonic, Mail-Meow, Mail-Otter).
 * Durable-DAV's is the canonical shape; names are de-scoped from
 * "replication" because every repo that encrypts a secret — replication remote
 * passwords, SES credentials, OAuth client secrets — has the same problem.
 *
 * Key material is base64 of exactly 32 bytes. A missing or wrong-sized key
 * throws rather than returning plaintext: the alternative — a helper that
 * quietly passes the value through when it cannot encrypt — would store the
 * secret in the clear on exactly the deployments that forgot to configure a
 * key, and nothing would report it.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

class AesGcmKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AesGcmKeyError';
  }
}

async function importKey(encodedKey: string | undefined | null): Promise<CryptoKey> {
  if (typeof encodedKey !== 'string' || encodedKey.trim() === '') {
    throw new AesGcmKeyError('Encryption key is not configured; the secret cannot be stored');
  }
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(encodedKey.trim());
  } catch {
    throw new AesGcmKeyError('Encryption key is not valid base64');
  }
  if (raw.byteLength !== KEY_BYTES) {
    throw new AesGcmKeyError(`Encryption key must decode to ${KEY_BYTES} bytes, got ${raw.byteLength}`);
  }
  try {
    return await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    throw new AesGcmKeyError('Encryption key could not be imported as an AES-GCM key');
  }
}

interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
}

/**
 * Encrypt one secret. The IV is random per call and returned alongside the
 * ciphertext so the caller can store the pair — reusing an IV under one key
 * destroys GCM's security guarantees outright, which is why it is not
 * internal to the ciphertext.
 */
async function encryptSecret(plaintext: string, encodedKey: string | undefined | null): Promise<EncryptedEnvelope> {
  const key = await importKey(encodedKey);
  const iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed: ArrayBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(sealed)), iv: bytesToBase64(iv) };
}

/**
 * Decrypt one envelope.
 *
 * Throws on a wrong key or tampered ciphertext rather than returning garbage:
 * a fail-closed decrypt turns a config mistake into a loud, immediate error
 * instead of corrupt data flowing into a downstream request.
 */
async function decryptSecret(envelope: EncryptedEnvelope, encodedKey: string | undefined | null): Promise<string> {
  const key = await importKey(encodedKey);
  const iv: Uint8Array = base64ToBytes(envelope.iv);
  const ciphertext: Uint8Array = base64ToBytes(envelope.ciphertext);
  const opened: ArrayBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return new TextDecoder().decode(opened);
}

/** Round-trip helper for tests and one-shot migrations. */
async function roundTripSecret(plaintext: string, encodedKey: string): Promise<string> {
  const envelope: EncryptedEnvelope = await encryptSecret(plaintext, encodedKey);
  return decryptSecret(envelope, encodedKey);
}

export { AesGcmKeyError, decryptSecret, encryptSecret, roundTripSecret, IV_BYTES, KEY_BYTES };
export type { EncryptedEnvelope };
