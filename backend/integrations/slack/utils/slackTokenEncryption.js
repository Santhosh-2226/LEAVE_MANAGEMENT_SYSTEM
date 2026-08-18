import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte Buffer key from the environment variable SLACK_TOKEN_ENCRYPTION_KEY
 */
function getEncryptionKey() {
  const rawKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('SLACK_TOKEN_ENCRYPTION_KEY environment variable is not configured');
  }

  // If 64 hex characters (32 bytes hex)
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // Otherwise hash to 32 bytes using SHA-256
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext Slack token using AES-256-GCM
 * @param {string} plaintext 
 * @returns {string} ivHex:authTagHex:encryptedHex
 */
export function encryptSlackToken(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Invalid token format for encryption');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted token string using AES-256-GCM
 * @param {string} cipherString ivHex:authTagHex:encryptedHex
 * @returns {string} decrypted plaintext token
 */
export function decryptSlackToken(cipherString) {
  if (!cipherString || typeof cipherString !== 'string') {
    throw new Error('Invalid ciphertext format for decryption');
  }

  const parts = cipherString.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
