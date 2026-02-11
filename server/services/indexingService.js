import { QdrantVectorStore } from "@langchain/qdrant";
import path from "path";
import PQueue from "p-queue";
import pRetry from "p-retry";
import fs from "fs";
import crypto from "crypto";  


import { createDocumentService } from "#services/documentService.js";
import { createEmbeddingService } from "#core/embeddings/embeddingService.js";
import { createQdrantService } from "#core/vectorstore/qdrantService.js";
import { config } from "#config/index.js";
import logger from "#utils/logger.js";

const indexingQueue = new PQueue({
  concurrency: 3,  
  timeout: 300000,  
});

const collectionCache = new Set();

const EMBEDDING_BATCH_SIZE = 50;  

/**
 * Creates an indexing service for document indexing operations
 * @param {Object} options - Configuration options
 * @returns {Object} Indexing service with methods
 */
export const createIndexingService = (options = {}) => {
  const documentService = createDocumentService(options);
  const embeddingService = createEmbeddingService(options.embedding);
  const qdrantService = createQdrantService(options.qdrant);

  const cacheDir = path.join(process.cwd(), 'cache', 'embeddings');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    logger.info(`Created embeddings cache directory: ${cacheDir}`);
  }

  /**
   * Generate cache key for document chunks
   */
  const getCacheKey = (tenantId, documentId, chunkConfig) => {
    return crypto
      .createHash('md5')
      .update(`${tenantId}_${documentId}_${chunkConfig.chunkSize}_${chunkConfig.chunkOverlap}`)
      .digest('hex');
  };

  /**
   * Load chunks from cache
   */
  const getCachedChunks = (cacheKey) => {
    const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
    
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        logger.info(` Loaded ${cached.chunks.length} chunks from cache`);
        return cached.chunks;
      } catch (error) {
        logger.warn(`Cache read error for ${cacheKey}: ${error.message}`);
        return null;
      }
    }
    return null;
  };

  const cacheChunks = (cacheKey, chunks) => {
    const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
    
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({
        chunks,
        timestamp: new Date().toISOString(),
        count: chunks.length
      }));
      logger.info(`💾 Cached ${chunks.length} chunks for future use`);
    } catch (error) {
      logger.warn(`Cache write error for ${cacheKey}: ${error.message}`);
    }
  };

  /**
   * Clear cache for specific document or all
   */
  const clearCache = (cacheKey = null) => {
    if (cacheKey) {
      const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        logger.info(` Cleared cache for ${cacheKey}`);
      }
    } else {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(cacheDir, file));
      });
      logger.info(`Cleared all embedding cache (${files.length} files)`);
    }
  };

  /**
   * Generate a document ID from file path
   * @param {string} filePath - Path to document
   * @returns {string} Generated document ID
   */
  const generateDocumentId = (filePath) => {
    return path.basename(filePath, path.extname(filePath));
  };

  const ensureCollection = async (collectionName) => {
    if (collectionCache.has(collectionName)) {
      return;
    }

    const exists = await qdrantService.collectionExists(collectionName);
    if (!exists) {
      logger.info(`Collection ${collectionName} does not exist. Creating...`);
      await qdrantService.createCollection(collectionName);
    }

    collectionCache.add(collectionName);
  };

  /**
   * Check if document is already indexed
   */
  const isDocumentIndexed = async (tenantId, documentId, collectionName) => {
    try {
      const filter = {
        must: [
          { key: "tenant_id", match: { value: tenantId } },
          { key: "document_id", match: { value: documentId } }
        ]
      };

      // Falls back to countDocuments if hasDocuments doesn't exist
      if (typeof qdrantService.hasDocuments === 'function') {
        return await qdrantService.hasDocuments(collectionName, filter);
      }
      
      // Fallback to count
      const count = await qdrantService.countDocuments(collectionName, filter);
      return count > 0;
    } catch (error) {
      logger.error('Failed to check if document is indexed:', error);
      return false;
    }
  };


  const embedChunksInBatches = async (chunks, onProgress) => {
    const totalBatches = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
    
    logger.info(` Embedding ${chunks.length} chunks in ${totalBatches} batches`);

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map(chunk => chunk.pageContent);
      const currentBatch = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;

      logger.debug(`Embedding batch ${currentBatch}/${totalBatches} (${texts.length} chunks)`);

      // We don't actually need to return embeddings since fromDocuments will handle it
      // But we verify the service works by making a test call with retry
      await pRetry(
        () => embeddingService.embedDocuments(texts),
        {
          retries: 3,
          onFailedAttempt: (error) => {
            logger.warn(
              `Embedding attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left`
            );
          }
        }
      );

      //  Report progress for each batch
      onProgress?.({
        stage: 'embedding',
        progress: 50 + ((currentBatch / totalBatches) * 30),
        currentBatch,
        totalBatches
      });
    }
    
    logger.info(`All ${totalBatches} embedding batches completed`);
  };

  /**
   * @param {string} filePath - Path to document
   * @param {string} tenantId - Tenant identifier
   * @param {Object} metadata - Additional metadata (should include customer_email, customer_name, customer_id if document is customer-specific)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Indexing result
   */
  const indexDocument = async (filePath, tenantId, metadata = {}, onProgress) => {
    return indexingQueue.add(async () => {
      const startTime = Date.now();
      
      try {
        const collectionName = tenantId;
        const fileName = path.basename(filePath);
        
        logger.info(`Indexing document for tenant ${tenantId}: ${fileName}`);

        const documentId = metadata.document_id || generateDocumentId(filePath);

        onProgress?.({ stage: 'checking', progress: 5 });
        const alreadyIndexed = await isDocumentIndexed(tenantId, documentId, collectionName);
        
        if (alreadyIndexed) {
          logger.info(` Document already indexed: ${documentId}`);
          return {
            success: true,
            skipped: true,
            reason: 'already_indexed',
            documentId,
            duration: ((Date.now() - startTime) / 1000).toFixed(2)
          };
        }

        // Ensure collection exists
        onProgress?.({ stage: 'preparing', progress: 10 });
        await ensureCollection(collectionName);
        
        // Process document into chunks with customer metadata
        onProgress?.({ stage: 'processing', progress: 20 });
        const enrichedMetadata = {
          tenant_id: tenantId,
          document_id: documentId,
          indexed_at: new Date().toISOString(),
          ...metadata,  // This can include customer_email, customer_name, customer_id, document_type, etc.
        };
        
        // Log if customer-specific document
        if (metadata.customer_email) {
          logger.info(`  Customer-specific document for: ${metadata.customer_email}`);
        }
        

        let chunks = await documentService.processDocument(
          filePath,
          enrichedMetadata,
          (docProgress) => {
            onProgress?.({
              stage: 'processing',
              progress: 20 + (docProgress.progress * 0.3)
            });
          }
        );

        // Ensure all chunks have a 'modality' field for multimodal retrieval
        const inferModality = (meta) => {
          if (meta?.modality) return meta.modality;
          if (meta?.source) {
            const ext = (meta.source.split('.').pop() || '').toLowerCase();
            if (["png","jpg","jpeg"].includes(ext)) return "image";
            if (["mp3","wav"].includes(ext)) return "audio";
          }
          return "text";
        };
        chunks = chunks.map(chunk => ({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            modality: inferModality(chunk.metadata)
          }
        }));

        if (chunks.length === 0) {
          throw new Error('No chunks generated from document');
        }

        logger.info(` Generated ${chunks.length} chunks from ${fileName}`);

        await embedChunksInBatches(chunks, onProgress);

        // Store in Qdrant (this will handle embeddings internally)
        onProgress?.({ stage: 'storing', progress: 80 });
        await pRetry(
          async () => {
            await QdrantVectorStore.fromDocuments(
              chunks,
              embeddingService.getEmbeddings(),
              {
                url: config.qdrant.url,
                collectionName,
              }
            );
          },
          {
            retries: 3,
            minTimeout: 1000,
            onFailedAttempt: (error) => {
              logger.warn(`Storage attempt ${error.attemptNumber} failed. Retrying...`);
            }
          }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(` Indexed ${chunks.length} chunks for ${fileName} in ${duration}s`);

        onProgress?.({ stage: 'complete', progress: 100 });

        return {
          success: true,
          chunks: chunks.length,
          duration,
          documentId,
          fileName
        };
      } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error(` Indexing failed after ${duration}s:`, error.message);
        onProgress?.({ stage: 'error', progress: 0, error: error.message });
        throw error;
      }
    });
  };

  /**
   * Index multiple documents
   * @param {string[]} filePaths - Array of document paths
   * @param {string} tenantId - Tenant identifier
   * @param {Object} metadata - Additional metadata
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} Array of indexing results
   */
  const indexMultipleDocuments = async (filePaths, tenantId, metadata = {}, onProgress) => {
    logger.info(`Indexing ${filePaths.length} documents for tenant ${tenantId}`);
    
    //  Track all stats
    let completed = 0;
    let successful = 0;
    let skipped = 0;
    let failed = 0;

    const promises = filePaths.map((filePath, index) => 
      indexDocument(
        filePath,
        tenantId,
        metadata,
        (progress) => {
          onProgress?.({
            fileIndex: index,
            fileName: path.basename(filePath),
            ...progress
          });
        }
      )
        .then(result => {
          completed++;
          
          if (result.skipped) {
            skipped++;
          } else {
            successful++;
          }
          
          onProgress?.({
            overall: true,
            completed,
            successful,
            skipped,
            failed,
            total: filePaths.length,
            progress: Math.round((completed / filePaths.length) * 100)
          });
          
          return { filePath, ...result };
        })
        .catch(error => {
          completed++;
          failed++;
          
          logger.error(` Failed to index ${path.basename(filePath)}:`, error.message);
          
          onProgress?.({
            overall: true,
            completed,
            successful,
            skipped,
            failed,
            total: filePaths.length,
            progress: Math.round((completed / filePaths.length) * 100)
          });
          
          return { 
            filePath, 
            success: false, 
            error: error.message 
          };
        })
    );

    const allResults = await Promise.all(promises);
    
    logger.info(
      `Batch indexing complete: ${successful} successful, ${skipped} skipped, ${failed} failed (${filePaths.length} total)`
    );
    
    return allResults;
  };

  /**
   * Delete documents for a tenant
   * @param {string} tenantId - Tenant identifier
   * @param {string|null} documentId - Optional document ID
   * @returns {Promise<void>}
   */
  const deleteDocuments = async (tenantId, documentId = null) => {
    const collectionName = tenantId;
    
    const filter = documentId
      ? {
          must: [
            { key: "tenant_id", match: { value: tenantId } },
            { key: "document_id", match: { value: documentId } }
          ]
        }
      : {
          must: [{ key: "tenant_id", match: { value: tenantId } }]
        };

    await qdrantService.deleteByFilter(collectionName, filter);
    
    if (documentId) {
      logger.info(` Deleted document ${documentId} for tenant ${tenantId}`);
    } else {
      logger.info(` Deleted all documents for tenant ${tenantId}`);
    }
  };

  const getQueueStatus = () => {
    return {
      pending: indexingQueue.pending,
      size: indexingQueue.size,
      concurrency: indexingQueue.concurrency,
    };
  };

  const clearCollectionCache = () => {
    collectionCache.clear();
    logger.debug('Collection cache cleared');
  };

  /**
   * Better error handling in cache stats
   */
  const getCacheStats = () => {
    try {
      const files = fs.readdirSync(cacheDir);
      const stats = [];
      let errorCount = 0;

      files.forEach(file => {
        try {
          const filePath = path.join(cacheDir, file);
          const stat = fs.statSync(filePath);
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          
          stats.push({
            file,
            size: stat.size,
            chunks: content.count,
            timestamp: content.timestamp
          });
        } catch (error) {
          errorCount++;
          logger.warn(`Failed to read cache file ${file}: ${error.message}`);
        }
      });

      const totalSize = stats.reduce((sum, s) => sum + s.size, 0);
      const totalChunks = stats.reduce((sum, s) => sum + s.chunks, 0);

      return {
        files: files.length,
        validFiles: stats.length,
        corruptedFiles: errorCount,
        totalSize,
        totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        totalChunks,
        entries: stats
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        files: 0,
        validFiles: 0,
        corruptedFiles: 0,
        totalSize: 0,
        totalSizeFormatted: '0 MB',
        totalChunks: 0,
        entries: []
      };
    }
  };

  return {
    indexDocument,
    indexMultipleDocuments,
    deleteDocuments,
    generateDocumentId,
    getQueueStatus,
    clearCollectionCache,
    isDocumentIndexed,
    clearCache,
    getCacheStats,
  };
};

export default createIndexingService;