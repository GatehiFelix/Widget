import asyncHandler from "express-async-handler";
import logger from "../utils/logger.js";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { processDocumentJob } from "../worker/documentWorker.js";

import { ClientDocument } from "#models/index.js";

/**
 * @desc upload and index single document
 * @route POST /api/documents/index
 * @access Public
 */

export const uploadDocumentController = asyncHandler(async (req, res) => {
  const { file } = req;
  const { tenant_id, metadata: rawMetadata } = req.body;
  console.log("upload docs req.body", req.body);

  if (!file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const metadata =
    typeof rawMetadata === "string"
      ? JSON.parse(rawMetadata || "{}")
      : rawMetadata || {};

  const doc = await ClientDocument.create({
    tenant_id,
    product_id: metadata.product_id || null,
    name: file.originalname,
    size: file.size,
    type: path.extname(file.originalname).replace(".", "").toLowerCase(),
    status: "processing",
    document_hash: null,
    job_id: uuidv4(),
  });
  console.log("created doc registry entry", doc.toJSON());

  logger.info(`📋 Registry entry created: ${doc.id} | job: ${doc.job_id}`);

  res.status(202).json({
    success: true,
    message: "Document accepted, processing in background",
    data: {
      documentId: doc.id,
      jobId: doc.job_id,
      name: doc.name,
      status: "processing",
    },
  });

  processDocumentJob({
    jobId: doc.job_id,
    filePath: file.path,
    tenantId: doc.tenant_id,
    metadata,
    ragApp: req.ragApp,
  }).catch((err) => {
    logger.error(
      `Unhandled worker error for job ${doc.job_id}: ${err.message}`,
    );
  });
});

export const batchUploadDocumentController = asyncHandler(async (req, res) => {
  if (!req.file || req.file.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No file uploaded.",
    });
  }

  const { tenant_id } = req.body;
  const metadata = JSON.parse(req.body.metadata || "{}");

  logger.info(
    `Batch indexing documents for tenant ${tenant_id}: ${req.file.originalname}`,
  );

  const filePaths = req.files.map((f) => f.path);
  const results = await req.ragApp.indexMultipleDocuments(
    filePaths,
    tenant_id,
    metadata,
  );

  res.status(200).json({
    success: true,
    message: "  Documents indexed successfully.",
    data: {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    },
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

  logger.info(
    `Deleting documents for tenant ${tenant_id}, document_id: ${document_id}`,
  );

  await req.ragApp.deleteDocuments(tenant_id, document_id);

  res.status(200).json({
    success: true,
    message: document_id
      ? `Document ${document_id} deleted successfully.`
      : `All documents for tenant ${tenant_id} deleted successfully.`,
  });
});

/**
 * @desc Get tenant's document stats
 * @route GET /api/documents/stats/:tenant_id
 * @access Public
 */

export const getDocumentStatsController = asyncHandler(async (req, res) => {
  const { tenant_id } = req.params;

  // Run both in parallel
  const [qdrantStats, allDocs, topDocs, recentActivity] = await Promise.all([
    req.ragApp.getTenantStats(tenant_id), // ← your existing method, unchanged

    ClientDocument.findAll({
      where: { tenant_id },
      attributes: [
        "id",
        "name",
        "size",
        "type",
        "status",
        "chunk_count",
        "query_count",
        "uploaded_at",
        "indexed_at",
      ],
    }),

    ClientDocument.findAll({
      where: { tenant_id, status: "indexed" },
      order: [["query_count", "DESC"]],
      limit: 5,
      attributes: ["id", "name", "type", "query_count"],
    }),

    ClientDocument.findAll({
      where: { tenant_id },
      order: [["uploaded_at", "DESC"]],
      limit: 10,
      attributes: [
        "id",
        "name",
        "type",
        "status",
        "uploaded_at",
        "indexed_at",
        "error_message",
      ],
    }),
  ]);

  const storageBytes = allDocs.reduce((sum, d) => sum + Number(d.size), 0);
  const typeBreakdown = allDocs.reduce((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: {
      // From Qdrant — live vector store state
      tenant_id: qdrantStats.tenant_id,
      collection_name: qdrantStats.collection_name,
      vector_count: qdrantStats.document_count, // rename to be explicit

      // From DB registry — rich dashboard data
      totalDocuments: allDocs.length,
      processing: allDocs.filter((d) => d.status === "processing").length,
      failed: allDocs.filter((d) => d.status === "failed").length,
      storageUsed: {
        bytes: storageBytes,
        mb: (storageBytes / (1024 * 1024)).toFixed(1),
      },
      topDocuments: topDocs.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        queryCount: d.query_count,
      })),
      typeBreakdown,
      recentActivity: recentActivity.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        status: doc.status,
        chunkCount: doc.chunk_count,
        event:
          doc.status === "processing"
            ? `Processing ${doc.name}`
            : doc.status === "indexed"
              ? `Indexed ${doc.name}`
              : `Failed ${doc.name}`,
        color:
          doc.status === "indexed"
            ? "green"
            : doc.status === "failed"
              ? "red"
              : "blue",
        timestamp: doc.indexed_at || doc.uploaded_at,
        error: doc.error_message || null,
      })),
    },
  });
});

/**
 * @desc Get document processing status by job_id
 * @route GET /api/documents/job/:job_id
 * @access Public
 */

export const getJobStatusController = asyncHandler(async (req, res) => {
  const { job_id } = req.params;

  const doc = await ClientDocument.findOne({
    where: { job_id },
    attributes: [
      "id",
      "job_id",
      "name",
      "status",
      "chunk_count",
      "error_message",
      "indexed_at",
      "uploaded_at",
    ],
  });

  if (!doc) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }

  // Map DB status to what the frontend progress reducer expects
  const stageMap = {
    processing: { stage: "processing", percent: 50, label: "Processing..." },
    indexed: { stage: "complete", percent: 100, label: "Done ✓" },
    failed: {
      stage: "error",
      percent: 0,
      label: doc.error_message || "Failed",
    },
  };

  const progress = stageMap[doc.status] || stageMap.processing;

  res.status(200).json({
    success: true,
    data: {
      jobId: doc.job_id,
      documentId: doc.id,
      fileName: doc.name,
      status: doc.status,
      chunkCount: doc.chunk_count,
      error: doc.error_message,
      ...progress,
    },
  });
});
