import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
import { config } from "../../config/index.js";
import logger from "../../utils/logger.js";

let clientPool = [];
const POOL_SIZE = 10;

/**
 * Creates a Qdrant service for vector database operations
 * @param {Object} options - Configuration options
 * @returns {Object} Qdrant service with methods
 */
export const createQdrantService = (options = {}) => {
  //  Initialize pool ONCE
  if (clientPool.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      clientPool.push(new QdrantClient({
        url: options.url || config.qdrant.url,
        apiKey: options.apiKey || config.qdrant.apiKey,
        timeout: 60000,
      }));
    }
  }

  const getClient = () => {
    return clientPool[Math.floor(Math.random() * clientPool.length)];
  };

  /**
   * Check if a collection exists
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<boolean>} True if collection exists
   */
  const collectionExists = async (collectionName) => {
    const client = getClient(); 
    try {
      const collections = await client.getCollections();
      return collections.collections.some(c => c.name === collectionName);
    } catch (error) {
      logger.error('Failed to check collection existence:', error);
      throw error;
    }
  };

  /**
   * Create a new collection
   * @param {string} collectionName - Name of the collection
   * @param {number} vectorSize - Size of vectors (default: 3072)
   * @returns {Promise<void>}
   */
  const createCollection = async (collectionName, vectorSize = 3072) => {
    const client = getClient(); 
    try {
      logger.info(`Creating collection: ${collectionName}`);
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
    } catch (error) {
      logger.error('Failed to create collection:', error);
      throw error;
    }
  };

  /**
   * Delete a collection
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<void>}
   */
  const deleteCollection = async (collectionName) => {
    const client = getClient(); 
    try {
      logger.info(`Deleting collection: ${collectionName}`);
      await client.deleteCollection(collectionName);
    } catch (error) {
      logger.error('Failed to delete collection:', error);
      throw error;
    }
  };

  /**
   * Count documents in a collection with optional filter
   * @param {string} collectionName - Name of the collection
   * @param {Object|null} filter - Optional filter
   * @returns {Promise<number>} Document count
   */
  const countDocuments = async (collectionName, filter = null) => {
    const client = getClient();
    try {
      const result = await client.scroll(collectionName, {
        filter,
        limit: 1,
        with_payload: false,
        with_vector: false,
      });
      return result.points.length;
    } catch (error) {
      // If collection doesn't exist, treat as 0 docs and log as info
      if (
        error?.status === 404 &&
        error?.data?.status?.error &&
        error.data.status.error.includes("doesn't exist")
      ) {
        logger.info(`Collection ${collectionName} does not exist (count=0).`);
        return 0;
      }
      logger.error('Failed to count documents:', error);
      throw error;
    }
  };

  /**
   * Delete documents by filter
   * @param {string} collectionName - Name of the collection
   * @param {Object} filter - Filter criteria
   * @returns {Promise<void>}
   */
  const deleteByFilter = async (collectionName, filter) => {
    const client = getClient();
    try {
      logger.info(`Deleting documents from ${collectionName}`);
      await client.delete(collectionName, { filter });
    } catch (error) {
      logger.error('Failed to delete by filter:', error);
      throw error;
    }
  };

  /**
   * Create a vector store from existing collection
   * @param {Object} embeddings - Embeddings instance
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<QdrantVectorStore>} Vector store instance
   */
  const createVectorStore = async (embeddings, collectionName) => {
    return await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: config.qdrant.url,
      collectionName,
    });
  };

  return {
    collectionExists,
    createCollection,
    deleteCollection,
    countDocuments,
    deleteByFilter,
    createVectorStore,
    getClient,
  };
};

export default createQdrantService;