

import { createEmbeddingService } from "../embeddings/embeddingService.js";
import { createLLMService } from "../llm/llmService.js";
import { createQdrantService } from "../vectorstore/qdrantService.js";
import { formatRAGPrompt } from "../llm/promptTemplates.js";
import logger from "../../utils/logger.js";
import { config } from "../../config/index.js";


const MAX_HISTORY_MESSAGES = 6;   // keep last N turns to cap history tokens
const MAX_CONTEXT_CHARS   = 2000; // hard cap on retrieved-doc context chars


/**
 * Build candidate collection names for a tenant.
 * Order matters: prefer tenant-specific collections first, then global fallback.
 */
const buildCollectionCandidates = (tenantId) => {
  const tenant = String(tenantId);
  const prefixedTenant = tenant.startsWith("tenant_") ? tenant : `tenant_${tenant}`;

  return Array.from(
    new Set([
      tenant,
      prefixedTenant,
      process.env.QDRANT_DEFAULT_COLLECTION,
    ].filter(Boolean))
  );
};

/**
 * Build the Qdrant payload filter that scopes results to one tenant.
 */
const tenantFilter = (tenantId) => ({
  must: [{ key: "metadata.tenant_id", match: { value: tenantId } }],
});

/**
 * Remove duplicate chunks (same pageContent) from retrieved docs.
 */
const deduplicateDocs = (docsWithScores) => {
  const seen = new Set();
  return docsWithScores.filter(([doc]) => {
    if (seen.has(doc.pageContent)) return false;
    seen.add(doc.pageContent);
    return true;
  });
};

/**
 * Truncate conversation history to the last N messages and join them.
 * Prevents unbounded token growth in multi-turn sessions.
 */
const formatHistory = (conversationHistory) => {
  if (!conversationHistory?.length) return "";
  const recent = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  return recent
    .map((msg) =>
      `${msg.sender_type === "customer" ? "Customer" : "Agent"}: ${msg.content}`
    )
    .join("\n");
};

/**
 * Join retrieved doc content, capped at MAX_CONTEXT_CHARS.
 * Avoids feeding enormous context windows to the LLM unnecessarily.
 */
const buildContext = (docs) => {
  let result = "";
  for (const doc of docs) {
    const chunk = doc.pageContent;
    if (result.length + chunk.length > MAX_CONTEXT_CHARS) break;
    result += (result ? "\n\n---\n\n" : "") + chunk;
  }
  return result;
};


/**
 * Creates a RAG pipeline for retrieval-augmented generation.
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} RAG pipeline with methods
 */
export const createRAGPipeline = async (options = {}) => {
  const embeddingService = createEmbeddingService(options.embedding);
  const llmService       = createLLMService(options.llm);
  const qdrantService    = createQdrantService(options.qdrant);

  const kDocuments = options.kDocuments || 3;

  // Avoids recreating the vector store on every single request.
  const vectorStoreCache = new Map();
  const tenantCollectionCache = new Map();

  const resolveCollection = async (tenantId) => {
    const tenantKey = String(tenantId);
    if (tenantCollectionCache.has(tenantKey)) {
      return tenantCollectionCache.get(tenantKey);
    }

    const candidates = buildCollectionCandidates(tenantKey);

    for (const candidate of candidates) {
      try {
        if (await qdrantService.collectionExists(candidate)) {
          if (candidate !== candidates[0]) {
            logger.warn(
              `Resolved collection fallback for tenant ${tenantKey}: ${candidate}`
            );
          }
          tenantCollectionCache.set(tenantKey, candidate);
          return candidate;
        }
      } catch (error) {
        logger.warn(`Collection existence check failed for ${candidate}: ${error.message}`);
      }
    }

    const fallback = candidates[0];
    logger.warn(
      `No candidate collection exists for tenant ${tenantKey}. Using fallback: ${fallback}`
    );
    tenantCollectionCache.set(tenantKey, fallback);
    return fallback;
  };

  const getVectorStore = async (collectionName) => {
    if (!vectorStoreCache.has(collectionName)) {
      const vs = await qdrantService.createVectorStore(
        embeddingService.getEmbeddings(),
        collectionName
      );
      vectorStoreCache.set(collectionName, vs);
      logger.debug(`Vector store cached for collection: ${collectionName}`);
    }
    return vectorStoreCache.get(collectionName);
  };


  /**
   * Create a LangChain retriever scoped to one tenant.
   * @param {string} tenantId
   * @param {Object} retrieverOptions
   */
  const createRetriever = async (tenantId, retrieverOptions = {}) => {
    const collection = await resolveCollection(tenantId);
    logger.debug(`Creating retriever for collection: ${collection}`);

    const vectorStore = await getVectorStore(collection);

    return vectorStore.asRetriever({
      k:          retrieverOptions.k          || kDocuments,
      searchType: retrieverOptions.searchType || "similarity",
      filter:     tenantFilter(tenantId),
    });
  };

  // ── query ──────────────────────────────────────────────────────────────────

  /**
   * Full RAG query: retrieve → deduplicate → build prompt → generate.
   * @param {string} tenantId
   * @param {string} question
   * @param {Object} queryOptions
   */
  const query = async (tenantId, question, queryOptions = {}) => {
    logger.info(`Query [tenant=${tenantId}]: ${question}`);
    const startTime = Date.now();

    const collection = await resolveCollection(tenantId);

    let docsWithScores = [];
    try {
      const vectorStore = await getVectorStore(collection);

      // Pass the tenant filter here — query() was previously missing this,
      // which allowed cross-tenant document leakage.
      docsWithScores = await vectorStore.similaritySearchWithScore(
        question,
        queryOptions.k || kDocuments,
        tenantFilter(tenantId)   // ← fix: scope results to this tenant
      );
    } catch (error) {
      logger.warn(`Collection ${collection} not found or search failed: ${error.message}`);
    }

    const uniqueDocsWithScores = deduplicateDocs(docsWithScores);
    const retrievedDocs        = uniqueDocsWithScores.map(([doc]) => doc);

    logger.debug(`Retrieved ${docsWithScores.length} docs, ${retrievedDocs.length} after dedup`);

    const confidence = uniqueDocsWithScores.length > 0
      ? Math.round(Math.max(...uniqueDocsWithScores.map(([, score]) => score)) * 100)
      : null;

    logger.debug(`Confidence: ${confidence}`);

    // formatRAGPrompt receives context entities via options.context.
    // We do NOT additionally prepend knownEntities — that caused duplication.
    const context     = buildContext(retrievedDocs);          // char-capped
    const chatHistory = formatHistory(queryOptions.conversationHistory); // turn-capped

    const prompt = formatRAGPrompt(
      context,
      question,
      queryOptions.promptType || "support",
      chatHistory,
      queryOptions.context || {}  // known entities passed once, here
    );

    if (queryOptions.stream) {
      return (async function* () {
        for await (const chunk of llmService.stream(prompt)) {
          yield { answer: chunk, context: retrievedDocs };
        }
      })();
    }

    const llmResult  = await llmService.generate(prompt);
    const duration   = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Query completed in ${duration}s`);

    return {
      text:       llmResult.text,
      answer:     llmResult.text,   // backwards compat
      sources:    retrievedDocs.map((doc) => ({
        content:  doc.pageContent,
        metadata: doc.metadata,
      })),
      confidence,
      intent:     queryOptions.intent || null,
      usage:      llmResult.usage,
      context:    retrievedDocs,
      input:      question,
    };
  };

  // ── semanticSearch ─────────────────────────────────────────────────────────

  /**
   * Raw similarity search scoped to one tenant.
   * @param {string} tenantId
   * @param {string} searchQuery
   * @param {number} limit
   */
  const semanticSearch = async (tenantId, searchQuery, limit = 5) => {
    logger.info(`Semantic search [tenant=${tenantId}]: ${searchQuery}`);
    const collection  = await resolveCollection(tenantId);
    const vectorStore = await getVectorStore(collection);

    return vectorStore.similaritySearchWithScore(
      searchQuery,
      limit,
      tenantFilter(tenantId)
    );
  };

  return { createRetriever, query, semanticSearch };
};

export default createRAGPipeline;

