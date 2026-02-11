import express from 'express';
import {
    uploadDocumentController,
    batchUploadDocumentController,
    deleteDocumentsController,
    getDocumentStatsController
} from '#controllers/documentsController.js';

import { protect } from '../middleware/authMiddleware.js';
import { upload } from '#middleware/uploadMiddleware.js';
import { validateTenantId } from '#middleware/validateMiddleware.js';
import { strictRateLimiter } from '#middleware/rateLimitMiddleware.js';

const router = express.Router();

router.route('/upload').post(strictRateLimiter, upload.single('file'), validateTenantId, uploadDocumentController);
router.route('/batch-upload').post(strictRateLimiter, upload.array('files'), validateTenantId, batchUploadDocumentController);
router.route('/delete/:tenant_id').delete(strictRateLimiter, validateTenantId, deleteDocumentsController);
router.route('/stats/:tenant_id').get(strictRateLimiter, validateTenantId, getDocumentStatsController);

export default router; 