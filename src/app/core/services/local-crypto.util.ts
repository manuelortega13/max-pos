/**
 * Browser-side password hashing and JWT minting for offline login.
 *
 * Uses Web Crypto (crypto.subtle) only — no third-party dependency:
 *   - PBKDF2-HMAC-SHA256, 200_000 iterations, 16-byte random salt
 *     for the cached password verifier. Stored as { saltB64, hashB64 }.
 *   - HMAC-SHA256 for minting / verifying device-local JWTs. A
 *     32-byte device secret is generated once and persisted to IDB.
 *
 * Server-issued JWTs are unaffected — these helpers are only used when
 * the network is unreachable, and the backend will reject the local
 * tokens (different signing key) on the next online request, which
 * triggers a clean re-login. That's the intended behavior.
 */

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const SECRET_BYTES = 32;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface LocalPasswordHash {
  readonly saltB64: string;
  readonly hashB64: string;
}

/** Hash a password for offline-login storage. Returns a salt + hash
 *  pair that {@link verifyPassword} can re-derive from. */
export async function hashPassword(password: string): Promise<LocalPasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return { saltB64: bufToB64(salt), hashB64: bufToB64(hash) };
}

/** Constant-time-ish verify a password against a stored hash. We
 *  don't strictly need constant-time here (the secret never leaves
 *  the device) but it's cheap to add. */
export async function verifyPassword(
  password: string,
  stored: LocalPasswordHash,
): Promise<boolean> {
  const salt = b64ToBuf(stored.saltB64);
  const expected = new Uint8Array(b64ToBuf(stored.hashB64));
  const actual = new Uint8Array(await pbkdf2(password, salt));
  if (actual.byteLength !== expected.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** Random 32-byte HMAC key, base64-encoded — call once per device,
 *  persist, and reuse for {@link signLocalJwt}. */
export function newDeviceSecret(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

/**
 * Mint a JWT signed locally so the rest of the app (which expects a
 * JWT in localStorage with an `exp` claim) keeps working offline.
 * The marker claim `iss: 'maxpos-local'` lets us detect these in
 * other code paths (e.g. to show an offline banner or to force a
 * re-login when the network comes back).
 */
export async function signLocalJwt(
  payload: Record<string, unknown>,
  deviceSecretB64: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'maxpos-local',
    iat: now,
    exp: now + ttlSeconds,
    ...payload,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = bufToB64Url(enc.encode(JSON.stringify(header)));
  const claimsB64 = bufToB64Url(enc.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;
  const key = await importHmacKey(deviceSecretB64);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  return `${signingInput}.${bufToB64Url(new Uint8Array(sig))}`;
}

/** True for tokens minted by {@link signLocalJwt}. Used to skip
 *  server-validation pings that would only ever fail with 401. */
export function isLocalJwt(token: string): boolean {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return false;
    const json = dec.decode(b64UrlToBuf(payloadB64));
    const decoded = JSON.parse(json) as { iss?: string };
    return decoded.iss === 'maxpos-local';
  } catch {
    return false;
  }
}

// ─────────────────────────── internals ─────────────────────────────

async function pbkdf2(password: string, salt: BufferSource): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256,
  );
}

async function importHmacKey(secretB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    b64ToBuf(secretB64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bufToB64Url(buf: ArrayBuffer | Uint8Array): string {
  return bufToB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Return ArrayBuffer (not Uint8Array<ArrayBufferLike>) so the result
// satisfies Web Crypto's BufferSource parameters under TS 5.x strictness.
function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

function b64UrlToBuf(b64url: string): ArrayBuffer {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64ToBuf(b64);
}
