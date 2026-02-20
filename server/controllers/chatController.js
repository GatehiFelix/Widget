import { ChatService } from '../services/chatService.js';
import asyncHandler from '../middleware/asyncHandler.js';
import crypto from 'crypto';
import { Client } from '../models/index.js';


/**
 * Generate unique session token
 */
const generateSessionToken = () => {
    return `sess_${crypto.randomUUID()}`;
};

/**
 * Generate visitor ID
 */
const generateVisitorId = () => {
    return `vis_${crypto.randomUUID()}`;
};

/**
 * Start or resume chat session
 * POST /api/chat/session
 * 
 * Accepts either clientId (actual ID) or productId (looks up client)
 */

export const startSession = asyncHandler(async (req, res) => {
    let { clientId, productId, roomId } = req.body;
    let { sessionToken, visitorId } = req.body;

    // If productId provided, look up the actual clientId
    if (!clientId && productId) {
        const client = await Client.findOne({
            where: { product_id: productId }
        });
        if (!client) {
            return res.status(404).json({
                success: false,
                error: `No client found with product_id: ${productId}`
            });
        }
        clientId = client.id;
    }

    if (!clientId) {
        return res.status(400).json({
            success: false,
            error: 'clientId or productId is required'
        });
    }

    // CRITICAL FIX: If no sessionToken OR (no roomId and no sessionToken), force new session
    const isNewSession = !sessionToken || (!roomId && !sessionToken);
    
    if (isNewSession) {
        sessionToken = generateSessionToken();
    } else if (!sessionToken) {
        sessionToken = generateSessionToken();
    }
    
    // only generate visitorId if not provided by client
    if (!visitorId) {
        visitorId = generateVisitorId();
    }

    // Call the ChatService method (which calls SessionContextService)
    const session = await ChatService.startSession(
        clientId, 
        sessionToken, 
        visitorId, 
        roomId || null  // Pass null if no roomId
    );

 

    res.json({
        success: true,
        data: {
            ...session,
            clientId,
            sessionToken,
            visitorId,
            isNewSession
        }
    });
});

/**
 * Send message and get AI response
 * POST /api/chat/message
 */
export const sendMessage = asyncHandler(async (req, res) => {
    const { clientId, roomId, content } = req.body;

    if (!clientId || !roomId || !content) {
        return res.status(400).json({
            success: false,
            error: 'clientId, roomId, and content are required'
        });
    }

    const result = await ChatService.processMessage(clientId, roomId, content);

    // Handover case — message already emitted via socket
    if (result.handover) {
        return res.json({
            success: true,
            data: {
                handover: true,
                reason: result.reason,
                assignedAgent: result.assignedAgent
                    ? { name: result.assignedAgent.name }
                    : null,
            }
        });
    }

    // Normal AI response case
    res.json({
        success: true,
        data: {
            message: result.aiMessage,
            sources: result.sources || []
        }
    });
});

/**
 * @desc Get chat history
 * @route GET /api/chat/history/:roomId
 */
export const getChatHistory = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { clientId, limit } = req.query;

    if (!clientId) {
        return res.status(400).json({
            success: false,
            error: 'clientId is required'
        });
    }

    const messages = await ChatService.getChatHistory(
        parseInt(roomId),
        parseInt(clientId),
        limit ? parseInt(limit) : undefined
    );

    res.json({
        success: true,
        data: messages
    });
});

/**
 * @desc Get conversation summaries for a client
 * @route GET /api/chat/conversations/:clientId
 */
export const getConversationsSummaries = asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const { visitorId } = req.query;

    if (!clientId || !visitorId) {
        return res.status(400).json({
            success: false,
            error: 'clientId and visitorId are required'
        });
    }

    const conversations = await ChatService.getConversationSummaries(parseInt(clientId), visitorId);

    res.json({
        success: true,
        data: conversations
    });
});



/**
 * @desc Escalate to human agent
 * @route POST /api/chat/escalate
 */
export const escalateToAgent = asyncHandler(async (req, res) => {
    const { clientId, roomId } = req.body;

    if (!clientId || !roomId) {
        return res.status(400).json({
            success: false,
            error: 'clientId and roomId are required'
        });
    }

    const result = await ChatService.escalateToAgent(roomId, clientId);

    res.json({
        success: true,
        data: result
    });
});

/**
 * Agent sends message
 * POST /api/chat/agent/message
 */
export const sendAgentMessage = asyncHandler(async (req, res) => {
    const { clientId, roomId, agentId, content } = req.body;

    if (!clientId || !roomId || !agentId || !content) {
        return res.status(400).json({
            success: false,
            error: 'clientId, roomId, agentId, and content are required'
        });
    }

    const message = await ChatService.sendAgentMessage(roomId, clientId, agentId, content);

    res.json({
        success: true,
        data: message
    });
});

/**
 * Close chat session
 * POST /api/chat/close
 */
export const closeSession = asyncHandler(async (req, res) => {
    const { clientId, roomId } = req.body;

    if (!clientId || !roomId) {
        return res.status(400).json({
            success: false,
            error: 'clientId and roomId are required'
        });
    }

    const result = await ChatService.closeSession(roomId, clientId);

    res.json({
        success: true,
        data: result
    });
});
