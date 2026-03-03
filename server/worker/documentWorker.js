import { emitJobProgress, emitTenantUpdate } from '../socket/index.js';
import {ClientDocument} from "#models/index.js"
import logger from '#utils/logger.js';
import { v4 as uuidv4 } from 'uuid';


/**
 * Process a document in the background.
 *
 * @param {Object} params
 * @param {string} params.jobId      - Links DB row ↔ WS channel ↔ frontend bar
 * @param {string} params.filePath   - Temp file on disk (we clean it up at end)
 * @param {string} params.tenantId
 * @param {Object} params.metadata
 * @param {Object} params.ragApp     - Your existing RAG app instance (req.ragApp)
 */
export const processDocumentJob = async ({ jobId, filePath, tenantId, metadata, ragApp }) => {

  // Shorthand: emit a stage + log it in one call
  const progress = (stage, percent, extra = {}) => {
    logger.info(`[Job ${jobId.slice(0, 8)}...] ${stage} — ${percent}%`);
    emitJobProgress(jobId, { stage, progress: percent, ...extra });
  };

  try {
    progress('loading', 10);
    progress('parsing', 25);


    const result = await ragApp.indexDocument(
      filePath,
      tenantId,
      metadata,
      (indexProgress) => {
        if (indexProgress.stage === 'splitting')  progress('chunking', 50);
        if (indexProgress.stage === 'embedding')  progress('embedding', 70);
        if (indexProgress.stage === 'complete')   progress('storing', 88);
      }
    );

    progress('finalizing', 93);

    // Update DB registry 
    await ClientDocument.update(
      {
        status: 'indexed',
        chunk_count: result?.chunks ?? result?.chunkCount ?? 0,
        document_hash: result?.documentId || uuidv4(),
        indexed_at: new Date(),
      },
      { where: { job_id: jobId } }
    );

    progress('complete', 100, {
      chunkCount: result?.chunkCount ?? 0,
      message: 'Document indexed successfully',
    });

    // Broadcast to all tenant clients so stat cards refresh
    emitTenantUpdate(tenantId, { event: 'stats_changed' });

    logger.info(`Job ${jobId.slice(0, 8)} complete`);

  } catch (error) {
    logger.error(`Job ${jobId.slice(0, 8)} failed: ${error.message}`);

    // Update DB — never leave a row stuck on 'processing'
    await ClientDocument.update(
      { status: 'failed', error_message: error.message },
      { where: { job_id: jobId } }
    ).catch((dbErr) =>
      logger.error(`DB update failed after job error: ${dbErr.message}`)
    );

    // Tell the frontend exactly what went wrong
    emitJobProgress(jobId, { stage: 'error', progress: 0, error: error.message });

  } finally {
    // Always delete the temp file — success or failure
    try {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
      logger.debug(`🧹 Temp file removed: ${filePath}`);
    } catch (e) {
      logger.warn(`Could not remove temp file ${filePath}: ${e.message}`);
    }
  }
};