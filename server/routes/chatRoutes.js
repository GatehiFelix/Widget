import { Router } from 'express';

import {
    startSession,
    sendMessage,
    getChatHistory,
    getConversationsSummaries,
    escalateToAgent,
    sendAgentMessage,
    closeSession
} from '#controllers/chatController.js';

const router = Router();

// Customer endpoints
router.post('/session', startSession);          
router.post('/message', sendMessage);           
router.get('/history/:roomId', getChatHistory);
router.get('/conversations/:clientId', getConversationsSummaries); 
router.post('/escalate', escalateToAgent);     
router.post('/close', closeSession);            

// Agent endpoints
router.post('/agent/message', sendAgentMessage); 

export default router;
