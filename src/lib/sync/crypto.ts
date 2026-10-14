// End-to-end encryption for sync. Everything is derived from the sync code, which never leaves
// the user's devices: the server only sees a vault id, an access token and encrypted bytes.

const enc = new TextEncoder();
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)

/** A new random sync code: 20 characters (100 bits) in groups of 4. */
export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** Upper-case, drop separators and map look-alike letters, so typing mistakes do not matter. */
export function normalizeSyncCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isValidSyncCode(code: string): boolean {
  const n = normalizeSyncCode(code);
  return n.length === 20 && [...n].every((c) => ALPHABET.includes(c));
}

export function formatSyncCode(code: string): string {
  return normalizeSyncCode(code).match(/.{1,4}/g)?.join('-') ?? '';
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export interface SyncKeys {
  vaultId: string;
  token: string;
  key: CryptoKey;
}

/** Derive the vault id, access token and AES key from the code (PBKDF2-SHA256). */
export async function deriveKeys(code: string, iterations = 200_000): Promise<SyncKeys> {
  const material = await crypto.subtle.importKey('raw', enc.encode(normalizeSyncCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('workout-tracker-sync-v1'), iterations }, material, 512);
  const all = new Uint8Array(bits);
  const key = await crypto.subtle.importKey('raw', all.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const tail = all.slice(32);
  const vaultId = hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...enc.encode('vault:'), ...tail])));
  const token = hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...enc.encode('token:'), ...tail])));
  return { vaultId, token, key };
}

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Encrypt bytes; result = base64(iv ‖ ciphertext). */
export async function encrypt(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(data)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decrypt(key: CryptoKey, b64: string): Promise<Uint8Array> {
  const all = fromB64(b64);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12)));
}
