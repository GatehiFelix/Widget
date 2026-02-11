import { createQdrantService } from "#core/vectorstore/qdrantService.js";
import { config } from "#config/index.js";
import logger from "#utils/logger.js";
import NodeCache from "node-cache";

const tenantCache = new NodeCache({
  stdTTL: 300,
  maxKeys: 1000,
  useClones: false,
});

const CACHE_KEYS = {
  TENANT_LIST: 'tenant_list',
  TENANT_COUNT: (tenantId) => `tenant_count_${tenantId}`,
  TENANT_STATS: (tenantId) => `tenant_stats_${tenantId}`,
};

export const createTenantService = (options = {}) => {
  const qdrantService = createQdrantService(options.qdrant);
  // Use a function to get the tenant-specific collection name
  const getCollectionName = (tenantId) => tenantId;

  /**
   *   Validate tenant ID
   */
  const validateTenantId = (tenantId) => {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('Invalid tenant ID: must be a  string');
    }

    if (tenantId.length < 1 || tenantId.length > 100) {
      throw new Error('Invalid tenant ID: must be between 1-100 characters');
    }

    // Prevent injection attacks
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new Error('Invalid tenant ID: only alphanumeric, hyphens, and underscores allowed');
    }

    return tenantId;
  };

  /**
   *   validation
   */
  const getTenantDocumentCount = async (tenantId) => {
    validateTenantId(tenantId);

    const cacheKey = CACHE_KEYS.TENANT_COUNT(tenantId);
    const cached = tenantCache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug(`Cache hit for tenant count: ${tenantId}`);
      return cached;
    }

    const collectionName = getCollectionName(tenantId);
    const filter = {
      must: [{ key: "tenant_id", match: { value: tenantId } }]
    };

    try {
      const points = await qdrantService.getClient().scroll(collectionName, {
        filter,
        with_payload: true,
        with_vector: false,
        limit: 10000
      });
      const uniqueDocIds = new Set(points.points.map(pt => pt.payload?.document_id));
      const count = uniqueDocIds.size;
      tenantCache.set(cacheKey, count);
      return count;
    } catch (error) {
      // If collection doesn't exist, treat as 0 docs and log as info
      if (
        error?.status === 404 &&
        error?.data?.status?.error &&
        error.data.status.error.includes("doesn't exist")
      ) {
        logger.info(`Collection ${collectionName} does not exist for tenant ${tenantId} (count=0).`);
        tenantCache.set(cacheKey, 0);
        return 0;
      }
      logger.error('Failed to get tenant document count:', error);
      throw error;
    }
  };

  /**
   *   Pagination to scan ALL documents
   */
  const listTenants = async () => {
    const cached = tenantCache.get(CACHE_KEYS.TENANT_LIST);
    
    if (cached) {
      logger.debug('Cache hit for tenant list');
      return cached;
    }

    try {
      const tenantIds = new Set();
      let offset = null;
      let hasMore = true;
      let totalScanned = 0;

      //  Paginate through ALL documents
      while (hasMore) {
        const result = await qdrantService.getClient().scroll(
          collectionName,
          {
            limit: 100,              //  Smaller batches
            offset: offset,          //  Continue from last position
            with_payload: true,
            with_vector: false,
          }
        );

        // Extract tenant IDs from current batch
        result.points.forEach(point => {
          if (point.payload?.tenant_id) {
            tenantIds.add(point.payload.tenant_id);
          }
        });

        totalScanned += result.points.length;

        //  Check if there are more results
        if (result.points.length < 100) {
          hasMore = false;
        } else {
          offset = result.next_page_offset || null;
          if (!offset) hasMore = false;
        }

        logger.debug(`Scanned ${totalScanned} documents, found ${tenantIds.size} tenants so far`);
      }

      const tenantList = Array.from(tenantIds).sort();
      tenantCache.set(CACHE_KEYS.TENANT_LIST, tenantList);
      
      logger.info(`Found ${tenantList.length} tenants across ${totalScanned} documents`);
      return tenantList;

    } catch (error) {
      logger.error('Failed to list tenants:', error);
      throw error;
    }
  };

  /**
   *   validation with tennant id included
   */
  const getTenantStats = async (tenantId) => {
    validateTenantId(tenantId);

    const cacheKey = CACHE_KEYS.TENANT_STATS(tenantId);
    const cached = tenantCache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for tenant stats: ${tenantId}`);
      return cached;
    }

    const collectionName = getCollectionName(tenantId);
    const documentCount = await getTenantDocumentCount(tenantId);

    const stats = {
      tenant_id: tenantId,
      document_count: documentCount,
      collection_name: collectionName,
      last_updated: new Date().toISOString(),
    };

    tenantCache.set(cacheKey, stats);
    return stats;
  };

  /**
   *  confirmation requirement and audit
   */
  const deleteTenant = async (tenantId, confirm = false) => {
    validateTenantId(tenantId);

    if (!confirm) {
      throw new Error(
        `Tenant deletion requires explicit confirmation. ` +
        `This will delete ALL data for client "${tenantId}". ` +
        `Pass { confirm: true } to proceed.`
      );
    }

    logger.warn(`  DELETING ALL DATA FOR TENANT: ${tenantId}`);

    try {
      //  ADDED: Get count before deletion (for audit log)
      const documentCountBefore = await getTenantDocumentCount(tenantId);

      if (documentCountBefore === 0) {
        logger.info(`Tenant ${tenantId} has no documents to delete`);
        return {
          success: true,
          tenant_id: tenantId,
          documents_deleted: 0,
          message: 'No documents found'
        };
      }

      const filter = {
        must: [{ key: "tenant_id", match: { value: tenantId } }]
      };

      await qdrantService.deleteByFilter(collectionName, filter);
      
      // Invalidate cache
      tenantCache.del(CACHE_KEYS.TENANT_COUNT(tenantId));
      tenantCache.del(CACHE_KEYS.TENANT_STATS(tenantId));
      tenantCache.del(CACHE_KEYS.TENANT_LIST);
      
      logger.info(` Tenant ${tenantId} deleted successfully (${documentCountBefore} documents removed)`);

      //  Return detailed result
      return {
        success: true,
        tenant_id: tenantId,
        documents_deleted: documentCountBefore,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`❌ Failed to delete tenant ${tenantId}:`, error);
      throw error;
    }
  };

  const tenantExists = async (tenantId) => {
    validateTenantId(tenantId);
    const count = await getTenantDocumentCount(tenantId);
    return count > 0;
  };

  /**
   * Get batch stats for multiple clients
   */
  const getTenantStatsBatch = async (tenantIds) => {
    if (!Array.isArray(tenantIds)) {
      throw new Error('tenantIds must be an array');
    }

    const statsPromises = tenantIds.map(tenantId =>
      getTenantStats(tenantId).catch(error => ({
        tenant_id: tenantId,
        error: error.message,
        document_count: 0
      }))
    );

    return await Promise.all(statsPromises);
  };

  const clearCache = () => {
    const keys = tenantCache.keys().length;
    tenantCache.flushAll();
    logger.info(`Cleared tenant cache (${keys} entries)`);
  };

  /**
   * Cache statistics
   */
  const getCacheStats = () => {
    const stats = tenantCache.getStats();
    return {
      keys: tenantCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0
    };
  };

  return {
    getTenantDocumentCount,
    listTenants,
    getTenantStats,
    getTenantStatsBatch,  
    deleteTenant,
    tenantExists,      
    clearCache,
    getCacheStats,        
  };
};

export default createTenantService;