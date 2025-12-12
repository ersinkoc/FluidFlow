/**
 * Server-side encryption utilities for sensitive data like API keys.
 * Uses AES-256-GCM for authenticated encryption.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Key file location - stored in settings directory
const SETTINGS_DIR = path.join(process.cwd(), 'settings');
const KEY_FILE = path.join(SETTINGS_DIR, '.encryption_key');

// Prefix to identify encrypted values
const ENCRYPTED_PREFIX = 'enc:';

// In-memory cache of the encryption key
let cachedKey: Buffer | null = null;

/**
 * Gets or creates the encryption key.
 * The key is stored in a separate file and cached in memory.
 */
async function getOrCreateKey(): Promise<Buffer> {
  if (cachedKey) {
    return cachedKey;
  }

  // Ensure settings directory exists
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }

  if (existsSync(KEY_FILE)) {
    // Read existing key
    const keyHex = await fs.readFile(KEY_FILE, 'utf-8');
    cachedKey = Buffer.from(keyHex.trim(), 'hex');
  } else {
    // Generate new key
    cachedKey = crypto.randomBytes(KEY_LENGTH);
    // ENC-001 fix: Set file permissions (Unix) and hide file (Windows)
    await fs.writeFile(KEY_FILE, cachedKey.toString('hex'), { mode: 0o600 });

    // ENC-001 fix: On Windows, mode:0o600 is ignored, so use attrib to hide the file
    // BUG-FIX: Use execFileSync with args array to prevent command injection
    if (process.platform === 'win32') {
      try {
        execFileSync('attrib', ['+H', KEY_FILE], { stdio: 'ignore' });
      } catch {
        // Ignore errors - hiding is best-effort security measure
      }
    }

    console.log('[Encryption] Generated new encryption key');
  }

  return cachedKey;
}

/**
 * Encrypts a string value using AES-256-GCM.
 * Returns a prefixed string: "enc:<iv>:<authTag>:<ciphertext>" (all hex encoded)
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }

  // Don't double-encrypt
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }

  const key = await getOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts an encrypted string.
 * Handles both encrypted (prefixed) and plaintext values for backwards compatibility.
 */
export async function decrypt(encryptedValue: string): Promise<string> {
  if (!encryptedValue) {
    return encryptedValue;
  }

  // If not encrypted (legacy plaintext), return as-is
  if (!encryptedValue.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedValue;
  }

  const key = await getOrCreateKey();

  // Parse the encrypted format: "enc:<iv>:<authTag>:<ciphertext>"
  const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3) {
    console.error('[Encryption] Invalid encrypted format');
    return ''; // Return empty on invalid format
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    console.error('[Encryption] Decryption failed:', error);
    return ''; // Return empty on decryption failure
  }
}

/**
 * Checks if a value is encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTED_PREFIX) ?? false;
}

/**
 * Encrypts sensitive fields in a provider config object.
 * Only encrypts apiKey field.
 */
export async function encryptProviderConfig<T extends { apiKey?: string }>(
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
 * Decrypts sensitive fields in a provider config object.
 * Only decrypts apiKey field.
 */
export async function decryptProviderConfig<T extends { apiKey?: string }>(
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
