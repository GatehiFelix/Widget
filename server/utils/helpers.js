import crypto from 'crypto';
import path from 'path';

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Generated ID
 */
export const generateId = (prefix = '') => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
};

/**
 * Generate a document ID from file path
 * @param {string} filePath - Path to file
 * @returns {string} Generated document ID
 */
export const generateDocumentId = (filePath) => {
  const fileName = path.basename(filePath, path.extname(filePath));
  const hash = crypto
    .createHash('md5')
    .update(filePath)
    .digest('hex')
    .substring(0, 8);
  return `${fileName}_${hash}`;
};

/**
 * Sanitize text by removing extra whitespace
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export const sanitizeText = (text) => {
  return text
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Truncate text to maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncate = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Format duration in milliseconds
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (milliseconds) => {
  const seconds = (milliseconds / 1000).toFixed(2);
  return `${seconds}s`;
};

/**
 * Chunk an array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array[]} Array of chunks
 */
export const chunk = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Function result
 */
export const retry = async (fn, options = {}) => {
  const maxRetries = options.maxRetries || 3;
  const delay = options.delay || 1000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delay * Math.pow(2, i));
    }
  }
};

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default {
  generateId,
  generateDocumentId,
  sanitizeText,
  truncate,
  sleep,
  formatDuration,
  chunk,
  retry,
  formatBytes,
};
