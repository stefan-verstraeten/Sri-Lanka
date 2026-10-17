// Passphrase-based encryption shared by the app (browser) and tools/vault.mjs (Node).
// PBKDF2-SHA256 derives an AES-256-GCM key; the box is plain JSON so it can be committed.

const te = new TextEncoder();
const td = new TextDecoder();

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// Typing on an iPhone tends to capitalise the first letter or add a trailing space.
export function normalizePass(pass) {
  return String(pass).normalize('NFC').trim().toLowerCase();
}

async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(normalizePass(pass)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(obj, pass, iterations = 310000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
}

// Throws when the passphrase is wrong (AES-GCM authentication fails).
export async function decryptJSON(box, pass) {
  const key = await deriveKey(pass, fromB64(box.salt), box.iterations);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
  return JSON.parse(td.decode(pt));
}
