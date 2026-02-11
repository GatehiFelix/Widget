import PQueue from "p-queue";
import NodeCache from "node-cache";
import crypto from "crypto";
import pTimeout from "p-timeout";

import { createRAGPipeline } from "#core/rag/ragPipeline.js";
import logger from "#utils/logger.js";


import { searchTickets, semanticSearch as vectorSearchUtil } from "../utils/mysqlSearch.js";

const queryQueue = new PQueue({
  concurrency: 10,
  timeout: 30000,  
});

const queryCache = new NodeCache({
  stdTTL: 1800,
  maxKeys: 1000,
  useClones: false,
});

const queryMetrics = {
  totalQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  avgLatency: 0,
  latencies: [],
};

const MAX_QUESTION_LENGTH = 1000;
const MIN_QUESTION_LENGTH = 3;
const QUERY_TIMEOUT = 30000; 

/**
 * Creates a query service for RAG queries
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Query service with methods
 */
export const createQueryService = async (options = {}) => {
  const ragPipeline = await createRAGPipeline(options);

  //  Better cache key with SHA-256 and normalized query
  const getCacheKey = (tenantId, question, options = {}) => {
    const normalized = question.trim().toLowerCase();
    const key = `${tenantId}:${normalized}:${JSON.stringify(options)}`;
    return crypto.createHash("sha256").update(key).digest("hex");
  };

  const validateQuery = (tenantId, question) => {
    if (!tenantId || typeof tenantId !== "string") {
      throw new Error("Invalid tenant ID");
    }

    if (!question || typeof question !== "string") {
      throw new Error("Invalid question");
    }

    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length < MIN_QUESTION_LENGTH) {
      throw new Error(
        `Question is too short. Minimum length is ${MIN_QUESTION_LENGTH} characters.`,
      );
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      throw new Error(
        `Question is too long. Maximum length is ${MAX_QUESTION_LENGTH} characters.`,
      );
    }

    return trimmedQuestion;
  };

  //  Prevent memory leak with larger sliding window
  const updateMetrics = (latency, cacheHit = false, error = false) => {
    queryMetrics.totalQueries += 1;

    if (cacheHit) queryMetrics.cacheHits++;
    else queryMetrics.cacheMisses++;
    
    if (error) queryMetrics.errors++;

    if (latency) {
      queryMetrics.latencies.push(latency);
      
      // Keep last 1000 samples instead of 100
      if (queryMetrics.latencies.length > 1000) {
        queryMetrics.latencies.shift();
      }

      const sum = queryMetrics.latencies.reduce((a, b) => a + b, 0);
      queryMetrics.avgLatency = sum / queryMetrics.latencies.length;
    }
  };

  //  OPTIMIZED: Fast regex-based classification (no async needed)
  const classifyQuery = (query) => {
    const lowerQuery = query.toLowerCase();
    
    // Pure greeting (without a question)
    if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening)[.!?]*$/i.test(lowerQuery)) {
      return "greeting";
    }
    
    // Everything else goes to vector search (RAG is primary data source)
    // This is where uploaded documents are stored and searched
    return "vector";
  };

  /**
   *  OPTIMIZED: Hybrid retrieve with route parameter to avoid double classification
   * @param {string} tenantId - Tenant identifier
   * @param {string} query - User query
   * @param {Object} options - Options including route
   * @returns {Promise<Object>} Results from appropriate source
   */
  const hybridRetrieve = async (tenantId, query, options = {}) => {
    const { route = 'auto', limit = 5 } = options;
    
    // Only classify if route not provided (allows controller to pass pre-classified route)
    const queryRoute = route === 'auto' ? classifyQuery(query) : route;

    logger.debug(`Query classified as: ${queryRoute}`);

    if (queryRoute === "greeting") {
      return {
        source: "greeting",
        results: [{ text: "Hello! How can I help you today?" }],
      };
    }
    
    if (queryRoute === "mysql") {
      try {
        const sqlResults = await searchTickets(query, tenantId);
        
        // If MySQL returns empty, fall back to vector search
        if (!sqlResults || sqlResults.length === 0) {
          logger.info('MySQL returned no results, falling back to vector search');
          const vectorResults = await vectorSearchUtil(tenantId, query, limit);
          return { 
            source: "vector_fallback", 
            results: vectorResults,
            fallbackReason: "mysql_empty"
          };
        }
        
        return { 
          source: "mysql", 
          results: sqlResults.slice(0, limit) 
        };
      } catch (error) {
        logger.error('MySQL search failed:', error.message);
        // Fall back to vector search on error
        logger.info('Falling back to vector search due to MySQL error');
        const vectorResults = await vectorSearchUtil(tenantId, query, limit);
        return { 
          source: "vector_fallback", 
          results: vectorResults,
          fallbackReason: "mysql_error"
        };
      }
    }
    
    if (queryRoute === "vector") {
      try {
        const vectorResults = await vectorSearchUtil(tenantId, query, limit);
        return { 
          source: "vector", 
          results: vectorResults 
        };
      } catch (error) {
        logger.error('Vector search failed:', error.message);
        throw error;
      }
    }
    
    // Hybrid: Should never reach here since we default to vector
    // But keep for backwards compatibility
    logger.debug('Hybrid mode triggered (fallback)');
    const vectorResults = await vectorSearchUtil(tenantId, query, limit);
    return { 
      source: "vector",
      results: vectorResults
    };
  };

  /**
   * Query the RAG system
   * @param {string} tenantId - Tenant identifier
   * @param {string} question - User question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  const query = async (tenantId, question, options = {}) => {
    const startTime = Date.now();

    try {
      const validatedQuestion = validateQuery(tenantId, question);
      logger.info(`Processing query for tenant ${tenantId}`);

      // Skip cache for streaming queries
      if (!options.stream) {
        const cacheKey = getCacheKey(tenantId, validatedQuestion, options);
        const cached = queryCache.get(cacheKey);

        if (cached) {
          logger.info(`Cache HIT for query: ${cacheKey.substring(0, 16)}...`);
          updateMetrics(Date.now() - startTime, true);
          return {
            ...cached,
            cached: true,
            timestamp: new Date().toISOString(),
          };
        }
      }

      const result = await queryQueue.add(async () => {
        return await pTimeout(
          ragPipeline.query(tenantId, validatedQuestion, options),
          {
            milliseconds: QUERY_TIMEOUT,
            message: `Query timeout after ${QUERY_TIMEOUT}ms`,
          },
        );
      });

      // Cache successful results
      if (!options.stream && result) {
        const cacheKey = getCacheKey(tenantId, validatedQuestion, options);
        queryCache.set(cacheKey, result);
        logger.debug(`Cached query result: ${cacheKey.substring(0, 16)}...`);
      }

      const latency = Date.now() - startTime;
      updateMetrics(latency, false, false);
      logger.info(`Query processed in ${latency}ms`);

      return {
        ...result,
        cached: false,
        latency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      updateMetrics(latency, false, true);

      logger.error("Query failed:", {
        tenantId,
        question: question?.substring(0, 100),
        error: error.message,
        latency,
      });
      throw error;
    }
  };

  /**
   * Stream a query response
   * @param {string} tenantId - Tenant identifier
   * @param {string} question - User question
   * @param {Object} options - Query options
   * @returns {Promise<AsyncIterable>} Stream of response chunks
   */
  const streamQuery = async (tenantId, question, options = {}) => {
    validateQuery(tenantId, question);
    return await query(tenantId, question, { ...options, stream: true });
  };

  /**
   * @param {string} tenantId - Tenant identifier
   * @param {string} searchQuery - Search query
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>} Search results
   */
  const semanticSearch = async (tenantId, searchQuery, limit = 5) => {
    try {
      const validatedQuery = validateQuery(tenantId, searchQuery);

      if (typeof limit !== "number" || limit < 1 || limit > 50) {
        throw new Error("Limit must be a number between 1 and 50");
      }

      const cacheKey = getCacheKey(tenantId, searchQuery, {
        type: "search",
        limit,
      });
      const cached = queryCache.get(cacheKey);

      if (cached) {
        logger.debug(`Cache HIT for semantic search: ${cacheKey.substring(0, 16)}...`);
        return cached;
      }

      const results = await queryQueue.add(async () => {
        return await pTimeout(
          ragPipeline.semanticSearch(tenantId, validatedQuery, limit),
          {
            milliseconds: 30000,  // Reduced from 60s
            message: "Semantic search timeout",
          },
        );
      });

      queryCache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error("Semantic search failed:", error);
      throw error;
    }
  };

  const clearCache = () => {
    const keys = queryCache.keys().length;
    queryCache.flushAll();
    logger.info(`Cleared query cache (${keys} entries removed)`);
  };

  const getQueueStatus = () => {
    return {
      pending: queryQueue.pending,
      size: queryQueue.size,
      concurrency: queryQueue.concurrency,
    };
  };

  const getMetrics = () => {
    const cacheHitRate = queryMetrics.totalQueries > 0
      ? ((queryMetrics.cacheHits / queryMetrics.totalQueries) * 100).toFixed(2)
      : 0;
      
    const errorRate = queryMetrics.totalQueries > 0
      ? ((queryMetrics.errors / queryMetrics.totalQueries) * 100).toFixed(2)
      : 0;

    return {
      ...queryMetrics,
      cacheHitRate: parseFloat(cacheHitRate),
      errorRate: parseFloat(errorRate),
      avgLatency: Math.round(queryMetrics.avgLatency),
    };
  };

  const resetMetrics = () => {
    queryMetrics.totalQueries = 0;
    queryMetrics.cacheHits = 0;
    queryMetrics.cacheMisses = 0;
    queryMetrics.errors = 0;
    queryMetrics.avgLatency = 0;
    queryMetrics.latencies = [];
    logger.info("Query metrics reset");
  };

  return {
    query,
    classifyQuery,
    hybridRetrieve,
    streamQuery,
    semanticSearch,  
    clearCache,
    getQueueStatus,
    getMetrics,
    resetMetrics,
  };
};

export default createQueryService;