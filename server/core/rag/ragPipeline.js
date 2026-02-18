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

    const overrideCollection = process.env.QDRANT_DEFAULT_COLLECTION;
    const normalizedTenant = tenantId.startsWith('tenant_') ? tenantId : `tenant_${tenantId}`;
    const tenantCollection = overrideCollection || normalizedTenant;

    let retrievedDocs = [];
    let docsWithScores = [];

    try {
        const vectorStore = await qdrantService.createVectorStore(
            embeddingService.getEmbeddings(),
            tenantCollection
        );

        // Use similaritySearchWithScore so we can compute confidence
        docsWithScores = await vectorStore.similaritySearchWithScore(
            question,
            options.k || kDocuments
        );

        retrievedDocs = docsWithScores.map(([doc]) => doc);
        logger.debug(`Retrieved ${retrievedDocs.length} docs from ${tenantCollection}`);
    } catch (error) {
        logger.warn(`Collection ${tenantCollection} not found: ${error.message}`);
    }

    // Compute confidence from similarity scores (scores are cosine similarity 0-1)
    const confidence = docsWithScores.length > 0
        ? Math.round(Math.max(...docsWithScores.map(([, score]) => score)) * 100)
        : null;

    logger.debug(`Confidence score: ${confidence} from ${docsWithScores.length} docs`);

    const context = retrievedDocs
        .map(doc => doc.pageContent)
        .join('\n\n---\n\n');

    const chatHistory = options.conversationHistory
        ? options.conversationHistory
            .map(msg => `${msg.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${msg.content}`)
            .join('\n')
        : '';

    // Inject collected context entities into prompt so LLM knows what's already known
    const knownEntities = options.context && Object.keys(options.context).length > 0
        ? `\nKnown customer details: ${JSON.stringify(options.context)}\nDo NOT ask for information already present above.\n`
        : '';

    const promptType = options.promptType || 'support';
    const basePrompt = formatRAGPrompt(context, question, promptType, chatHistory, options.context || {});
    const prompt = knownEntities ? `${knownEntities}\n${basePrompt}` : basePrompt;

    if (options.stream) {
        return (async function* () {
            for await (const chunk of llmService.stream(prompt)) {
                yield { answer: chunk, context: retrievedDocs };
            }
        })();
    }

    const llmResult = await llmService.generate(prompt);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Query completed in ${duration}s`);

    return {
        text: llmResult.text,           // clean string — chatService picks this up first
        answer: llmResult.text,         // kept for backwards compat
        sources: retrievedDocs.map(doc => ({
            content: doc.pageContent,
            metadata: doc.metadata,
        })),
        confidence,                     // now populated from vector scores
        intent: options.intent || null,
        usage: llmResult.usage,
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