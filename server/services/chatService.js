import { Message, ChatRoom, User, Client } from '#models/index.js';
import { SessionContextService } from '#services/sessionService.js';
import { createQueryService } from '#services/queryService.js';
import { emitNewMessage, emitTyping } from '#socket/index.js';
import logger from '#utils/logger.js';
import { Op } from 'sequelize';
import axios from 'axios';

const CONFIG = {
    MESSAGE_LIMIT: 50,
    CONTEXT_MESSAGES: 10,  // Last N messages for RAG context
    SESSION_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000
};

let queryService = null;

/**
 * Initialize query service (lazy load)
 */
const getQueryService = async () => {
    if (!queryService) {
        queryService = await createQueryService();
    }
    return queryService;
};

/**
 * Start or resume a chat session
 */

const startSession = async (clientId, sessionToken, visitorId, roomId = null) => {
    if (!clientId || !sessionToken) {
        throw new Error('clientId and sessionToken are required');
    }

    let session;
    if (roomId) {
        session = await SessionContextService.resumeOrCreateSession(
            clientId,
            sessionToken,
            visitorId,
            roomId
        );
    } else {
        session = await SessionContextService.resumeOrCreateSession(
            clientId,
            sessionToken,
            visitorId,
            null,
        );
    }

    return {
        roomId: session.room.id,
        messages: session.messages,
        context: session.context?.collected_entities || {},
        isNewSession: session.messages.length === 0
    };
};

/**
 * Save a message to the database
 */
const saveMessage = async (roomId, clientId, content, senderType, metadata = null, senderId = null) => {
    if (!roomId || !clientId || !content) {
        throw new Error('roomId, clientId, and content are required');
    }

    const message = await Message.create({
        room_id: roomId,
        client_id: clientId,
        content: content,
        sender_type: senderType,
        sender_id: senderId,
        metadata: metadata
    });

    // Update room activity
    await SessionContextService.trackActivity(roomId, clientId);

    return message;
};

/**
 * Get recent messages for context
 */
const getRecentMessages = async (roomId, limit = CONFIG.CONTEXT_MESSAGES) => {
    const messages = await Message.findAll({
        where: { room_id: roomId },
        order: [['created_at', 'DESC']],  // Get most recent first
        limit: limit
    });

    // Reverse to get chronological order (oldest to newest)
    return messages.reverse().map(m => ({
        sender_type: m.sender_type,
        content: m.content,
        created_at: m.created_at
    }));
};

/**
 * helper webhook call function
 */

const sendMessageWebhook = async(message) => {
    try {
        await axios.post('http://localhost:5000/webhook/message',message,{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }) 
    } catch (err) {
        logger.error('Failed to send message webhook:', err.message);
    }
}

/**
 * Process customer message and get AI response
 */
const processMessage = async (clientId, roomId, content) => {
    if (!clientId || !roomId || !content) {
        throw new Error('clientId, roomId, and content are required');
    }

    // 1. Save customer message
    const customerMessage = await saveMessage(
        roomId,
        clientId,
        content,
        'customer'
    );

    // Emit customer message immediately
    emitNewMessage(roomId, clientId, customerMessage);
    console.log('Customer message saved and emitted:', customerMessage.id);
    await sendMessageWebhook(customerMessage)
    

    // 2. Send immediate "thinking" indicator via typing event
    emitTyping(roomId, clientId, 'ai', true);

    // Small placeholder message (optional - comment out if not desired)
    let thinkingMessage = null;

    try {
        // 3. Get session context WHILE showing typing indicator
        const context = await SessionContextService.getOrCreateContext(roomId, clientId);

        // 4. Get recent messages for conversation history
        const conversationHistory = await getRecentMessages(roomId);

        // 5. Query RAG pipeline (optimized with fast DB-first approach)
        const qs = await getQueryService();
        const startTime = Date.now();
        const ragResponse = await qs.query(String(clientId), content, {
            conversationHistory: conversationHistory,
            context: context.collected_entities || {}
        });
        const queryDuration = Date.now() - startTime;
        
        logger.info(`Query completed in ${queryDuration}ms for tenant ${clientId}`);

        // Stop typing indicator
        emitTyping(roomId, clientId, 'ai', false);

        // Extract answer string from response
        let answerText = '';
        if (typeof ragResponse === 'string') {
            answerText = ragResponse;
        } else if (ragResponse?.text) {
            // Handle { text: "...", usage: {...} } format
            answerText = ragResponse.text;
        } else if (ragResponse?.answer) {
            answerText = typeof ragResponse.answer === 'string' 
                ? ragResponse.answer 
                : ragResponse.answer?.text || String(ragResponse.answer);
        } else if (ragResponse?.response) {
            answerText = ragResponse.response;
        } else if (ragResponse?.content) {
            answerText = ragResponse.content;
        } else {
            // Last resort - stringify but try to extract text first
            answerText = 'I apologize, but I could not generate a proper response.';
        }

        // Clean up the text (remove trailing whitespace)
        answerText = answerText.trim();

        // 6. Save AI response
        const aiMessage = await saveMessage(
            roomId,
            clientId,
            answerText,
            'ai',
            {
                sources: ragResponse?.sources || [],
                intent: ragResponse?.intent || null,
                confidence: ragResponse?.confidence || null,
                queryDuration: queryDuration
            }
        );

        // 7. Emit AI response
        emitNewMessage(roomId, clientId, aiMessage);
        console.log('AI message saved and emitted:', aiMessage.id);
        await sendMessageWebhook(aiMessage)

        // 8. Update context if entities were extracted
        if (ragResponse?.extractedEntities) {
            await SessionContextService.updateContext(roomId, clientId, {
                collected_entities: {
                    ...context.collected_entities,
                    ...ragResponse.extractedEntities
                }
            });
        }

        return {
            customerMessage,
            aiMessage,
            sources: ragResponse?.sources || []
        };

    } catch (error) {
        logger.error('Error processing message:', error);
        
        // Stop typing indicator
        emitTyping(roomId, clientId, 'ai', false);
        
        // Save error message
        const errorMessage = await saveMessage(
            roomId,
            clientId,
            'I apologize, but I encountered an error processing your request. Please try again.',
            'ai'
        );

        emitNewMessage(roomId, clientId, errorMessage);

        throw error;
    }
};

/**
 * Get chat history
 */
const getChatHistory = async (roomId, clientId, limit = CONFIG.MESSAGE_LIMIT) => {
    if (!roomId || !clientId) {
        throw new Error('roomId and clientId are required');
    }

    const messages = await Message.findAll({
        where: {
            room_id: roomId,
            client_id: clientId
        },
        order: [['created_at', 'ASC']],
        limit: limit
    });

    return messages;
};

/**
 * get conversation summaries for a client
 */

const getConversationSummaries = async (clientId, visitorId) => {
    if(!clientId || !visitorId) throw new Error('clientId and visitorId are required');

    const chatrooms = await ChatRoom.findAll({
        where: { client_id: clientId, widget_visitor_id: visitorId },
        order: [['last_activity_at', 'DESC']]
    });

    const summaries = await Promise.all(chatrooms.map(async (room) => {
        const lastMessage = await Message.findOne({
            where: { room_id: room.id, client_id: clientId },
            order: [['created_at', 'DESC']]
        });
        return {
            roomId: room.id,
            startedAt: room.created_at,
            endedAt: room.ended_at,
            lastMessage: lastMessage ? lastMessage.content : '',
            lastMessageAt: lastMessage ? lastMessage.created_at : null,
        }
    }));

    return summaries;
}

/**
 * Escalate chat to human agent
 */
const escalateToAgent = async (roomId, clientId) => {
    if (!roomId || !clientId) {
        throw new Error('roomId and clientId are required');
    }

    // Find available agent
    const availableAgent = await User.findOne({
        where: {
            client_id: clientId,
            role: 'agent',
            status: 'online',
            current_chat_count: {
                [Op.lt]: Op.col('max_concurrent_chats')
            }
        },
        order: [['current_chat_count', 'ASC']]
    });

    if (!availableAgent) {
        // No agent available - save system message
        await saveMessage(
            roomId,
            clientId,
            "All our agents are currently busy. Please wait and someone will be with you shortly.",
            'system'
        );

        return { assigned: false, message: 'No agents available' };
    }

    // Assign agent to room
    await ChatRoom.update(
        { assigned_agent_id: availableAgent.id },
        { where: { id: roomId, client_id: clientId } }
    );

    // Increment agent's chat count
    await User.increment('current_chat_count', {
        where: { id: availableAgent.id }
    });

    // Save system message
    await saveMessage(
        roomId,
        clientId,
        `You are now connected with ${availableAgent.name}. How can they help you today?`,
        'system'
    );

    return {
        assigned: true,
        agentId: availableAgent.id,
        agentName: availableAgent.name
    };
};

/**
 * Send message from agent to customer
 */
const sendAgentMessage = async (roomId, clientId, agentId, content) => {
    if (!roomId || !clientId || !agentId || !content) {
        throw new Error('roomId, clientId, agentId, and content are required');
    }

    const message = await saveMessage(
        roomId,
        clientId,
        content,
        'agent',
        null,
        agentId
    );

    emitNewMessage(roomId, clientId, message);

    return message;
};

/**
 * Close chat session
 */
const closeSession = async (roomId, clientId) => {
    if (!roomId || !clientId) {
        throw new Error('roomId and clientId are required');
    }

    // Get room to check for assigned agent
    const room = await ChatRoom.findOne({
        where: { id: roomId, client_id: clientId }
    });

    if (!room) {
        throw new Error('Chat room not found');
    }

    // Decrement agent's chat count if assigned
    if (room.assigned_agent_id) {
        await User.decrement('current_chat_count', {
            where: { id: room.assigned_agent_id }
        });
    }

    // Close session via SessionService
    await SessionContextService.closeSession(roomId, clientId);

    // Save system message
    await saveMessage(
        roomId,
        clientId,
        'This chat session has been closed. Thank you for contacting us!',
        'system'
    );

    return { closed: true };
};

export const ChatService = {
    startSession,
    getChatHistory,
    getConversationSummaries,
    processMessage,
    saveMessage,
    escalateToAgent,
    sendAgentMessage,
    closeSession,
    getRecentMessages
};