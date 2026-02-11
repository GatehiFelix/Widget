import { OllamaEmbeddings } from "@langchain/ollama";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import logger from "../../utils/logger.js";
import { config } from "../../config/index.js";

/**
 * Creates an embedding service for generating embeddings
 * @param {Object} options - Configuration options
 * @returns {Object} Embedding service with methods
 */
export const createEmbeddingService = (options = {}) => {
  const provider = options.provider || process.env.EMBEDDING_PROVIDER || process.env.LLM_PROVIDER || 'ollama';
  const modelName = options.modelName || process.env.EMBEDDING_MODEL || 'nomic-embed-text';
  const baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  
  // Configurable batch sizes
  const batchSize = options.batchSize || (provider === 'gemini' ? 50 : 100);
  const maxConcurrent = options.maxConcurrent || (provider === 'gemini' ? 5 : 3);

  logger.info(`Initializing embedding service with provider: ${provider}, model: ${provider === 'gemini' ? 'gemini-embedding-001' : modelName}`);
  logger.info(`Batch size: ${batchSize}, Max concurrent batches: ${maxConcurrent}`);

  let embeddings;

  if (provider === 'gemini') {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Gemini embedding provider');
    }
    
    // ✅ CRITICAL FIX: Use "models/gemini-embedding-001" format
    embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      model: "models/gemini-embedding-001",  // Must include "models/" prefix
      taskType: "RETRIEVAL_DOCUMENT"
    });
    
    logger.info(`✅ Using Google embedding model: gemini-embedding-001`);
  } else {
    embeddings = new OllamaEmbeddings({
      model: modelName,
      baseUrl,
    });
    logger.info(`✅ Using Ollama embedding model: ${modelName}`);
  }

  /**
   * Process items in batches with concurrency control
   * @param {Array} items - Items to process
   * @param {Function} processFn - Async function to process each batch
   * @param {number} batchSize - Size of each batch
   * @param {number} maxConcurrent - Max concurrent batches
   * @returns {Promise<Array>} Flattened results
   */
  const processBatches = async (items, processFn, batchSize, maxConcurrent) => {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results = [];
    
    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const batchGroup = batches.slice(i, i + maxConcurrent);
      logger.debug(`Processing batch group ${i / maxConcurrent + 1}/${Math.ceil(batches.length / maxConcurrent)} (${batchGroup.reduce((sum, b) => sum + b.length, 0)} documents)`);
      
      const batchResults = await Promise.all(
        batchGroup.map(batch => processFn(batch))
      );
      
      results.push(...batchResults);
    }

    return results.flat();
  };

  /**
   * Generate embeddings for documents
   * @param {string[]} documents - Array of document texts
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  const embedDocuments = async (documents) => {
    try {
      const startTime = Date.now();
      logger.info(`Generating embeddings for ${documents.length} documents using ${provider}`);
      
      const processBatch = async (batch) => {
        return await embeddings.embedDocuments(batch);
      };
      
      const results = await processBatches(documents, processBatch, batchSize, maxConcurrent);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`Generated ${results.length} embeddings in ${duration}s (${(results.length / duration).toFixed(1)} docs/sec)`);
      
      return results;
    } catch (error) {
      logger.error(`Failed to generate document embeddings: ${error.message}`);
      throw error;
    }
  };

  /**
   * Generate embedding for a single query
   * @param {string} query - Query text
   * @returns {Promise<number[]>} Embedding vector
   */
  const embedQuery = async (query) => {
    try {
      logger.debug(`Generating embedding for query: ${query.substring(0, 50)}...`);
      return await embeddings.embedQuery(query);
    } catch (error) {
      logger.error(`Failed to generate query embedding: ${error.message}`);
      throw error;
    }
  };

  /**
   * Get the embeddings instance (for LangChain compatibility)
   * Returns an object with embedDocuments and embedQuery methods
   * @returns {OllamaEmbeddings|GoogleGenerativeAIEmbeddings} Embeddings instance
   */
  const getEmbeddings = () => {
    return embeddings;
  };

  /**
   * Get embedding dimension
   * @returns {Promise<number>} Embedding dimension
   */
  const getDimension = async () => {
    try {
      const testEmbedding = await embedQuery('test');
      logger.info(`📏 Embedding dimension: ${testEmbedding.length}`);
      return testEmbedding.length;
    } catch (error) {
      logger.error(`Failed to get embedding dimension: ${error.message}`);
      if (provider === 'gemini') {
        return 3072; // gemini-embedding-001 dimension
      }
      return 768; // nomic-embed-text default dimension
    }
  };

  /**
   * Get model information
   * @returns {Object} Model configuration
   */
  const getModelInfo = () => ({
    provider,
    modelName: provider === 'gemini' ? 'gemini-embedding-001' : modelName,
    baseUrl: provider === 'gemini' ? 'Google Generative AI API' : baseUrl,
    batchSize,
    maxConcurrent,
  });

  return {
    getEmbeddings,
    embedDocuments,
    embedQuery,
    getDimension,
    getModelInfo,
  };
};

export default createEmbeddingService;