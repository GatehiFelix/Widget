import { createEmbeddingService } from "../embeddings/embeddingService.js";
import { createLLMService } from "../llm/llmService.js";
import { createQdrantService } from "../vectorstore/qdrantService.js";
import { getDefaultRAGPrompt, formatRAGPrompt } from "../llm/promptTemplates.js";
import logger from "../../utils/logger.js";
import { config } from "../../config/index.js";

/**
 * Creates a RAG pipeline for retrieval-augmented generation
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} RAG pipeline with methods
 */
export const createRAGPipeline = async (options = {}) => {
  const embeddingService = createEmbeddingService(options.embedding);
  const llmService = createLLMService(options.llm);
  const qdrantService = createQdrantService(options.qdrant);
  
  // Use tenant-specific collection name
  const collectionName = options.collectionName || config.qdrant.defaultCollection;
  const kDocuments = options.kDocuments || config.rag.kDocuments;

  logger.info(`Initializing RAG pipeline with collection: ${collectionName}`);
  
  /**
   * Create a retriever for a specific tenant
   * @param {string} tenantId - Tenant identifier
   * @param {Object} options - Retriever options
   * @returns {Object} Retriever instance
   */
  const createRetriever = async (tenantId, options = {}) => {
    // Use tenant-specific collection
    const tenantCollection = tenantId;
    
    logger.debug(`Creating retriever for collection: ${tenantCollection}`);
    
    // Create vector store for specific tenant collection
    const vectorStore = await qdrantService.createVectorStore(
      embeddingService.getEmbeddings(),
      tenantCollection
    );

    // Filter by metadata.tenant_id (correct path in payload)
    const filter = {
      must: [{ 
        key: "metadata.tenant_id", 
        match: { value: tenantId } 
      }]
    };

    return vectorStore.asRetriever({
      k: options.k || kDocuments,
      searchType: options.searchType || "similarity",
      filter,
    });
  };

  /**
   * Query the RAG system
   * @param {string} tenantId - Tenant identifier
   * @param {string} question - User question
   * @param {Object} options - Query options (customerEmail, customerName, customerId for filtering)
   * @returns {Promise<Object>} Query result
   */
  const query = async (tenantId, question, options = {}) => {
    logger.info(`Query from tenant ${tenantId}: ${question}`);
    
    const startTime = Date.now();

    // Use override collection if set, otherwise use tenantId as-is
    // tenantId can be "tenant_6000" or "6000" - normalize it
    const overrideCollection = process.env.QDRANT_DEFAULT_COLLECTION;
    const normalizedTenant = tenantId.startsWith('tenant_') ? tenantId : `tenant_${tenantId}`;
    const tenantCollection = overrideCollection || normalizedTenant;
    
    let retrievedDocs = [];
    
    try {
      const vectorStore = await qdrantService.createVectorStore(
        embeddingService.getEmbeddings(),
        tenantCollection
      );
      
      // Simple search without complex filtering
      retrievedDocs = await vectorStore.similaritySearch(
        question, 
        options.k || kDocuments
      );
      
      logger.debug(`Retrieved ${retrievedDocs.length} docs from ${tenantCollection}`);
    } catch (error) {
      logger.warn(`Collection ${tenantCollection} not found: ${error.message}`);
    }

    logger.debug(`Total retrieved ${retrievedDocs.length} documents`);

    // Format context from retrieved documents
    const context = retrievedDocs
      .map(doc => doc.pageContent)
      .join('\n\n---\n\n');

    // Format conversation history if provided
    const chatHistory = options.conversationHistory 
      ? options.conversationHistory
          .map(msg => `${msg.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${msg.content}`)
          .join('\n')
      : '';

    // Build the prompt (default to 'support' for chat interactions)
    const promptType = options.promptType || 'support';
    const prompt = formatRAGPrompt(context, question, promptType, chatHistory);

    // Generate response using LLM service
    if (options.stream) {
      // Return async generator for streaming
      return (async function* () {
        for await (const chunk of llmService.stream(prompt)) {
          yield { answer: chunk, context: retrievedDocs };
        }
      })();
    }

    const answer = await llmService.generate(prompt);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(`Query completed in ${duration}s`);
    console.log("Retrieved context chunks:", retrievedDocs.length);
    
    return {
      answer,
      context: retrievedDocs,
      input: question,
    };
  };

  /**
   * Perform semantic search
   * @param {string} tenantId - Tenant identifier
   * @param {string} searchQuery - Search query
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>} Search results with scores
   */
  const semanticSearch = async (tenantId, searchQuery, limit = 5) => {
    logger.info(`Semantic search from tenant ${tenantId}: ${searchQuery}`);
    
    const tenantCollection = tenantId;
    const vectorStore = await qdrantService.createVectorStore(
      embeddingService.getEmbeddings(),
      tenantCollection
    );
    
    const filter = {
      must: [{ 
        key: "metadata.tenant_id", 
        match: { value: tenantId } 
      }]
    };

    return await vectorStore.similaritySearchWithScore(searchQuery, limit, filter);
  };

  return {
    createRetriever,
    query,
    semanticSearch,
  };
};

export default createRAGPipeline;