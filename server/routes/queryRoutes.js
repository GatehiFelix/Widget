import express from 'express';

import{ 
    queryController,
    streamQueryController,
    semanticSearchController,
    hybridQueryController,
    chatController,
    getTokenUsageController,
} from '#controllers/queryControllers.js';
import { llmRagQueryController } from '#controllers/ragQueryController.js';
import { protect } from '#middleware/authMiddleware.js';
import { validateQuery} from '#middleware/validateMiddleware.js';

const router = express.Router();

// router.route('/').post(protect, validateQuery, queryController);
// router.route('/stream').post(protect, validateQuery, streamQueryController);
// router.route('/semantic-search').post(protect, validateQuery, semanticSearchController);

router.route('/').post( validateQuery, queryController);
router.post('/llm-rag', llmRagQueryController);
router.post('/chat', chatController);
router.route('/stream').post( validateQuery, streamQueryController);
router.route('/semantic-search').post( validateQuery, semanticSearchController);
router.route('/hybrid').post( validateQuery, hybridQueryController);
router.get('/token-usage', getTokenUsageController);

export default router;