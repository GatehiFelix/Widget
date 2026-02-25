import { Router } from 'express';

import {
    startSession,
    sendMessage,
    getChatHistory,
    saveAgentMessage,
    getConversationsSummaries,
    escalateToAgent,
    sendAgentMessage,
    closeSession,
    getSupervisorConversations,
    getAgentConversations,
    closeAgentConversation,
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
router.post('/agent-message', saveAgentMessage);
router.get('/supervisor/conversations', getSupervisorConversations);
router.get('/agent/conversations', getAgentConversations);
router.post('/agent/conversations/close', closeAgentConversation);

export default router;
