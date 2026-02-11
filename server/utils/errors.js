/**
 * Base application error
 */
export class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Tenant not found error
 */
export class TenantNotFoundError extends AppError {
  constructor(tenantId) {
    super(
      `Tenant not found: ${tenantId}`,
      'TENANT_NOT_FOUND',
      404
    );
  }
}

/**
 * Document not found error
 */
export class DocumentNotFoundError extends AppError {
  constructor(documentId) {
    super(
      `Document not found: ${documentId}`,
      'DOCUMENT_NOT_FOUND',
      404
    );
  }
}

/**
 * Indexing error
 */
export class IndexingError extends AppError {
  constructor(message) {
    super(
      `Indexing failed: ${message}`,
      'INDEXING_FAILED',
      500
    );
  }
}

/**
 * Query error
 */
export class QueryError extends AppError {
  constructor(message) {
    super(
      `Query failed: ${message}`,
      'QUERY_FAILED',
      500
    );
  }
}

/**
 * Invalid input error
 */
export class InvalidInputError extends AppError {
  constructor(message) {
    super(
      message,
      'INVALID_INPUT',
      400
    );
  }
}

export default {
  AppError,
  TenantNotFoundError,
  DocumentNotFoundError,
  IndexingError,
  QueryError,
  InvalidInputError,
};
