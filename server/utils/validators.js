/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate tenant ID
 * @param {string} tenantId - Tenant identifier
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
export const validateTenantId = (tenantId) => {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ValidationError('Tenant ID must be a non-empty string', 'tenantId');
  }

  if (tenantId.length < 3 || tenantId.length > 100) {
    throw new ValidationError('Tenant ID must be between 3 and 100 characters', 'tenantId');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new ValidationError('Tenant ID can only contain alphanumeric characters, hyphens, and underscores', 'tenantId');
  }

  return true;
};

/**
 * Validate question text
 * @param {string} question - User question
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
export const validateQuestion = (question) => {
  if (!question || typeof question !== 'string') {
    throw new ValidationError('Question must be a non-empty string', 'question');
  }

  if (question.trim().length === 0) {
    throw new ValidationError('Question cannot be empty', 'question');
  }

  if (question.length > 1000) {
    throw new ValidationError('Question must be less than 1000 characters', 'question');
  }

  return true;
};

/**
 * Validate file path
 * @param {string} filePath - Path to file
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
export const validateFilePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new ValidationError('File path must be a non-empty string', 'filePath');
  }

  const allowedExtensions = ['.pdf', '.txt', '.md', '.docx', '.doc', '.html', '.htm', '.csv'];
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(ext)) {
    throw new ValidationError(
      `File must be one of: ${allowedExtensions.join(', ')}`,
      'filePath'
    );
  }

  return true;
};

/**
 * Validate metadata object
 * @param {Object} metadata - Metadata to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
export const validateMetadata = (metadata) => {
  if (metadata && typeof metadata !== 'object') {
    throw new ValidationError('Metadata must be an object', 'metadata');
  }

  // Check for reserved keys
  const reservedKeys = ['tenant_id', 'chunk_index', 'processed_at'];
  if (metadata) {
    for (const key of reservedKeys) {
      if (key in metadata) {
        throw new ValidationError(
          `Metadata cannot contain reserved key: ${key}`,
          'metadata'
        );
      }
    }
  }

  return true;
};

/**
 * Validate limit parameter
 * @param {number} limit - Result limit
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
export const validateLimit = (limit) => {
  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    throw new ValidationError('Limit must be a number between 1 and 100', 'limit');
  }
  return true;
};

export default {
  ValidationError,
  validateTenantId,
  validateQuestion,
  validateFilePath,
  validateMetadata,
  validateLimit,
};
