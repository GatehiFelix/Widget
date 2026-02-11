import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * @desc upload and index single document
 * @route POST /api/documents/index
 * @access Public
 */

export const  uploadDocumentController = asyncHandler(async (req, res) => {
  const { file } = req;
  const { tenant_id, metadata } = req.body;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  let filePath = file.path;

  try {
    // ... existing upload logic ...
    
    const result = await req.ragApp.indexDocument(filePath, tenant_id, metadata);
    
    // ✅ Delete temp file after successful indexing
    await fs.unlink(filePath);
    logger.debug(`Cleaned up temp file: ${filePath}`);
    
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    // Delete temp file on error too
    try {
      await fs.unlink(filePath);
      logger.debug(`Cleaned up temp file after error: ${filePath}`);
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup temp file: ${cleanupError.message}`);
    }
    
    throw error; 
  }
});



export const batchUploadDocumentController = asyncHandler(async (req, res) => {
    if(!req.file || req.file.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No file uploaded.'
        })
    }

    const { tenant_id } = req.body;
    const metadata = JSON.parse(req.body.metadata || '{}');

    logger.info(`Batch indexing documents for tenant ${tenant_id}: ${req.file.originalname}`);

    const filePaths = req.files.map(f => f.path);
    const results = await req.ragApp.indexMultipleDocuments(
        filePaths,
        tenant_id,
        metadata
    )

    res.status(200).json({
        success: true,
        message: '  Documents indexed successfully.',
        data: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        }
    });
});


/**
 * @desc Delete tenant's documents
 * @route DELETE /api/documents
 * @access Public
 */

export const deleteDocumentsController = asyncHandler(async (req, res) => {
    const { tenant_id } = req.body;
    const { document_id } = req.body;

    logger.info(`Deleting documents for tenant ${tenant_id}, document_id: ${document_id}`);

    await req.ragApp.deleteDocuments(tenant_id, document_id);

    res.status(200).json({
        success: true,
        message: document_id ?
            `Document ${document_id} deleted successfully.` :
            `All documents for tenant ${tenant_id} deleted successfully.`
    })
});

/**
 * @desc Get tenant's document stats
 * @route GET /api/documents/stats/:tenant_id
 * @access Public
 */

export const getDocumentStatsController = asyncHandler(async (req, res) => {
    const { tenant_id } = req.params;
    console.log("req.params", req.params);
    console.log("tenant_id", tenant_id);

    logger.info(`Fetching document stats for tenant ${tenant_id}`);

    const stats = await req.ragApp.getTenantStats(tenant_id);

    res.status(200).json({
        success: true,
        data: stats
    })
})