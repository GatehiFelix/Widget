import express from 'express';
import {
    uploadDocumentController,
    batchUploadDocumentController,
    deleteDocumentsController,
    getDocumentStatsController,
    getJobStatusController,
} from '#controllers/documentsController.js';

import { protectCRM } from '../middleware/authMiddleware.js';
import { upload } from '#middleware/uploadMiddleware.js';
import { validateTenantId } from '#middleware/validateMiddleware.js';
import { strictRateLimiter } from '#middleware/rateLimitMiddleware.js';

const router = express.Router();

router.route('/upload').post(protectCRM, strictRateLimiter, upload.single('file'), validateTenantId, uploadDocumentController);
router.route('/batch-upload').post(protectCRM, strictRateLimiter, upload.array('files'), validateTenantId, batchUploadDocumentController);
router.route('/delete/:tenant_id').delete(protectCRM, strictRateLimiter, validateTenantId, deleteDocumentsController);
router.route('/stats/:tenant_id').get(protectCRM, strictRateLimiter, validateTenantId, getDocumentStatsController);
router.route('/job/:job_id').get(protectCRM, strictRateLimiter, getJobStatusController);

export default router; 