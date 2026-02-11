import { createIndexingService } from "./services/indexingService.js";
import { createQueryService } from "./services/queryService.js";
import { createTenantService } from "./services/tenantService.js";
import { validateTenantId, validateQuestion, validateFilePath, validateMetadata, validateLimit } from "./utils/validators.js";
import logger from "./utils/logger.js";

/**
 * Creates the main RAG application
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} RAG application instance
 */
export const createRAGApplication = async (options = {}) => {
  const indexingService = createIndexingService(options);
  const queryService = await createQueryService(options);
  const tenantService = createTenantService(options);

  logger.info(' Initializing RAG Application...');
  logger.info(' RAG Application ready');

  /**
   * Index a single document
   * @param {string} filePath - Path to document
   * @param {string} tenantId - Tenant identifier
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Indexing result
   */
  const indexDocument = async (filePath, tenantId, metadata = {}) => {
    validateFilePath(filePath);
    validateTenantId(tenantId);
    validateMetadata(metadata);
    
    return await indexingService.indexDocument(filePath, tenantId, metadata);
  };

  /**
   * Index multiple documents
   * @param {string[]} filePaths - Array of document paths
   * @param {string} tenantId - Tenant identifier
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Array>} Array of indexing results
   */
  const indexMultipleDocuments = async (filePaths, tenantId, metadata = {}) => {
    validateTenantId(tenantId);
    return await indexingService.indexMultipleDocuments(filePaths, tenantId, metadata);
  };

  /**
   * Delete documents for a tenant
   * @param {string} tenantId - Tenant identifier
   * @param {string|null} documentId - Optional document ID
   * @returns {Promise<void>}
   */
  const deleteDocuments = async (tenantId, documentId = null) => {
    validateTenantId(tenantId);
    return await indexingService.deleteDocuments(tenantId, documentId);
  };

  /**
   * Query the RAG system
   * @param {string} tenantId - Tenant identifier
   * @param {string} question - User question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  const query = async (tenantId, question, options = {}) => {
    validateTenantId(tenantId);
    validateQuestion(question);
    
    return await queryService.query(tenantId, question, options);
  };

  /**
   * Stream a query response
   * @param {string} tenantId - Tenant identifier
   * @param {string} question - User question
   * @param {Object} options - Query options
   * @returns {Promise<AsyncIterable>} Stream of response chunks
   */
  const streamQuery = async (tenantId, question, options = {}) => {
    validateTenantId(tenantId, question);
    
    
    return createRAGPipeline.query(tenantId, question, { ...options, stream: true });
  };  

  /**
   * Perform semantic search
   * @param {string} tenantId - Tenant identifier
   * @param {string} searchQuery - Search query
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>} Search results
   */
  const semanticSearch = async (tenantId, searchQuery, limit = 5) => {
    validateTenantId(tenantId);
    validateQuestion(searchQuery);
    validateLimit(limit);
    
    return await queryService.semanticSearch(tenantId, searchQuery, limit);
  };


  /**
   * Get statistics for a tenant
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<Object>} Tenant statistics
   */
  const getTenantStats = async (tenantId) => {
    validateTenantId(tenantId);
    return await tenantService.getTenantStats(tenantId);
  };

  /**
   * List all tenants
   * @returns {Promise<string[]>} Array of tenant IDs
   */
  const listTenants = async () => {
    return await tenantService.listTenants();
  };

  /**
   * Delete all data for a tenant
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<void>}
   */
  const deleteTenant = async (tenantId) => {
    validateTenantId(tenantId);
    return await tenantService.deleteTenant(tenantId);
  };

  return {
    indexDocument,
    indexMultipleDocuments,
    deleteDocuments,
    query,
    streamQuery,
    semanticSearch,
    getTenantStats,
    listTenants,
    deleteTenant,
  };
};

export default createRAGApplication;
