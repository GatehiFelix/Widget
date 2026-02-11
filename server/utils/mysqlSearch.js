import logger from './logger.js';

// MySQL search is DISABLED - RAG (vector search) is the primary data source
// All data should be uploaded as documents and embedded in Qdrant



/**
 * Search tickets/orders in MySQL database
 * DISABLED: RAG/Vector search is the primary data source
 * @param {string} query - Search query
 * @param {string} tenantId - Tenant identifier
 * @returns {Promise<Array>} Always returns empty (vector search is primary)
 */
export const searchTickets = async (query, tenantId) => {
    logger.debug('MySQL search skipped - RAG/Vector search is primary data source');
    return [];  // Always return empty to immediately use vector search
}

export const semanticSearch = async (tenantId, question, limit = 5) => {
  // This function should not be called - vector search is handled in queryService
  logger.warn('MySQL semanticSearch stub called - delegating to vector search in queryService');
  return [];
};