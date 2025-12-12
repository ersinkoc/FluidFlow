/**
 * Client-side encryption utilities for sensitive data like API keys.
 * Uses Web Crypto API with AES-GCM for authenticated encryption.
 *
 * Security notes:
 * - This provides defense-in-depth, not complete XSS protection
 * - Keys are encrypted at rest in localStorage
 * - The encryption key is derived from a stored secret + domain binding
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const SECRET_KEY = 'fluidflow_encryption_secret';
const ENCRYPTED_PREFIX = 'encrypted:';

// Cache the derived key
const _cachedKey: CryptoKey | null = null;
let cachedSecret: string | null = null;

/**
 * Gets or creates a secret for key derivation.
 * The secret is stored in localStorage and combined with the origin for domain binding.
 */
function getOrCreateSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }

  try {
    let secret = localStorage.getItem(SECRET_KEY);
    if (!secret) {
      // Generate a random secret
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      secret = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(SECRET_KEY, secret);
    }
    cachedSecret = secret;
    return secret;
  } catch {
    // Fallback for environments without localStorage
    return 'fallback-secret-for-ephemeral-session';
  }
}

/**
 * Derives an encryption key from the secret using PBKDF2.
 */
async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  // Combine secret with origin for domain binding
  const combined = secret + window.location.origin;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(combined),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// BUG-003 fix: Track if crypto API is available to avoid silent failures
let cryptoAvailable: boolean | null = null;

function isCryptoAvailable(): boolean {
  if (cryptoAvailable === null) {
    try {
      cryptoAvailable = !!(
        typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof crypto.subtle.encrypt === 'function' &&
        typeof crypto.getRandomValues === 'function'
      );
      if (!cryptoAvailable) {
        console.warn('[Encryption] Web Crypto API not available - encryption disabled');
      }
    } catch {
      cryptoAvailable = false;
      console.warn('[Encryption] Web Crypto API check failed - encryption disabled');
    }
  }
  return cryptoAvailable;
}

/**
 * Encrypts a string value.
 * Returns format: "encrypted:<salt>:<iv>:<ciphertext>" (all base64 encoded)
 * BUG-003 fix: Explicitly check crypto availability and throw on unexpected failures
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }

  // Don't double-encrypt
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }

  // BUG-003 fix: Early return with warning if crypto is unavailable
  if (!isCryptoAvailable()) {
    // In environments without crypto, return plaintext but log a clear warning
    console.warn('[Encryption] Storing value without encryption (crypto unavailable)');
    return plaintext;
  }

  try {
    const secret = getOrCreateSecret();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const key = await deriveKey(secret, salt);
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoder.encode(plaintext)
    );

    // Encode as base64 using Uint8Array iteration (safer than spread for large arrays)
    const saltB64 = btoa(Array.from(salt, b => String.fromCharCode(b)).join(''));
    const ivB64 = btoa(Array.from(iv, b => String.fromCharCode(b)).join(''));
    const ciphertextB64 = btoa(Array.from(new Uint8Array(ciphertext), b => String.fromCharCode(b)).join(''));

    return `${ENCRYPTED_PREFIX}${saltB64}:${ivB64}:${ciphertextB64}`;
  } catch (error) {
    // BUG-003 fix: Log detailed error and re-throw for unexpected failures
    // This ensures callers know encryption failed rather than silently storing plaintext
    console.error('[Encryption] Client-side encryption failed:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts an encrypted string.
 * Handles both encrypted (prefixed) and plaintext values for backwards compatibility.
 * BUG-003 fix: On decryption failure, throw error instead of returning empty string
 */
export async function decrypt(encryptedValue: string): Promise<string> {
  if (!encryptedValue) {
    return encryptedValue;
  }

  // If not encrypted (legacy plaintext), return as-is
  if (!encryptedValue.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedValue;
  }

  // BUG-003 fix: Early check for crypto availability
  if (!isCryptoAvailable()) {
    console.warn('[Encryption] Cannot decrypt - crypto unavailable, returning original value');
    return encryptedValue; // Return encrypted value rather than empty string
  }

  try {
    const secret = getOrCreateSecret();

    // Parse the encrypted format
    const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
    if (parts.length !== 3) {
      console.error('[Encryption] Invalid encrypted format - expected 3 parts, got', parts.length);
      throw new Error('Invalid encrypted format');
    }

    const [saltB64, ivB64, ciphertextB64] = parts;

    // Decode from base64 using Array.from (safer for binary data)
    const salt = new Uint8Array(Array.from(atob(saltB64), c => c.charCodeAt(0)));
    const iv = new Uint8Array(Array.from(atob(ivB64), c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(Array.from(atob(ciphertextB64), c => c.charCodeAt(0)));

    const key = await deriveKey(secret, salt);
    const decoder = new TextDecoder();

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    return decoder.decode(plaintext);
  } catch (error) {
    // BUG-003 fix: Log detailed error and throw instead of returning empty string
    // This prevents data loss and makes failures explicit
    console.error('[Encryption] Client-side decryption failed:', error);
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a value is encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTED_PREFIX) ?? false;
}

/**
 * Encrypts the apiKey field in a provider config.
 */
export async function encryptApiKey<T extends { apiKey?: string }>(
  config: T
): Promise<T> {
  if (!config.apiKey) {
    return config;
  }

  return {
    ...config,
    apiKey: await encrypt(config.apiKey),
  };
}

/**
 * Decrypts the apiKey field in a provider config.
 */
export async function decryptApiKey<T extends { apiKey?: string }>(
  config: T
): Promise<T> {
  if (!config.apiKey) {
    return config;
  }

  return {
    ...config,
    apiKey: await decrypt(config.apiKey),
  };
}

/**
 * Encrypts API keys in an array of provider configs.
 */
export async function encryptProviderConfigs<T extends { apiKey?: string }>(
  configs: T[]
): Promise<T[]> {
  return Promise.all(configs.map(config => encryptApiKey(config)));
}

/**
 * Decrypts API keys in an array of provider configs.
 */
export async function decryptProviderConfigs<T extends { apiKey?: string }>(
  configs: T[]
): Promise<T[]> {
  return Promise.all(configs.map(config => decryptApiKey(config)));
}
