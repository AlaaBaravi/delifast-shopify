/**
 * Encryption Utilities
 * For securely storing Delifast credentials
 */

import crypto from 'crypto';
import { config } from './config.server';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get encryption key (must be 32 bytes for aes-256)
 */
function getKey() {
  const key = config.encryptionKey;
  // Hash the key to ensure it's exactly 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string
 * @param {string} text - Plain text to encrypt
 * @returns {string|null} Encrypted string or null if input is empty
 */
export function encrypt(text) {
  if (!text) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted data
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a string
 * @param {string} encryptedText - Encrypted string
 * @returns {string|null} Decrypted text or null if input is empty
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return null;

  // Handle plain text (not encrypted) - for backwards compatibility
  if (!encryptedText.includes(':')) {
    return encryptedText;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
