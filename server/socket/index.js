import { Server } from 'socket.io';
import logger from '#utils/logger.js';

let io = null;

// In-memory store for active conversations
const activeConversations = {};

/**
 * Helper to broadcast active conversations
 */
const broadcastActiveConversations = () => {
    if (!io) return;
    const conversations = Object.values(activeConversations);
    io.emit('active-conversations', conversations);
    logger.info('[Broadcast] active-conversations:', conversations);
};

/**
 * Initialize Socket.io server with both chat and agent functionality
 */
export const initializeSocket = (httpServer) => {
    // Combine allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:5173'
    ];
    
    if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
        allowedOrigins.push(process.env.CLIENT_URL);
    }

    io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id}`);

        // ============================================
        // EXISTING CHAT FUNCTIONALITY (Don't touch!)
        // ============================================
        
        // Join a chat room
        socket.on('join_room', ({ roomId, clientId }) => {
            const room = `room_${roomId}_${clientId}`;
            socket.join(room);
            logger.info(`Socket ${socket.id} joined room: ${room}`);
            
            socket.emit('room_joined', { roomId, clientId });
        });

        // Leave a chat room
        socket.on('leave_room', ({ roomId, clientId }) => {
            const room = `room_${roomId}_${clientId}`;
            socket.leave(room);
            logger.info(`Socket ${socket.id} left room: ${room}`);
        });

        // Typing indicator
        socket.on('typing', ({ roomId, clientId, isTyping }) => {
            const room = `room_${roomId}_${clientId}`;
            socket.to(room).emit('user_typing', { isTyping });
        });

        // ============================================
        // NEW WIDGET-AGENT BROADCASTING
        // ============================================
        
        // Listen for messages from widget (LLM/user)
        socket.on('widget-message', (data) => {
            io.emit('agent-message', data);
            logger.info('[Widget->Agent] widget-message:', data);
            broadcastActiveConversations();
        });

        // Listen for messages from agent
        socket.on('agent-message', (data) => {
            io.emit('widget-message', data);
            logger.info('[Agent->Widget] agent-message:', data);
            broadcastActiveConversations();
        });

        // Start a conversation
        socket.on('start-conversation', (conversation) => {
            activeConversations[conversation.id] = conversation;
            logger.info('[Conversation] Started:', conversation);
            broadcastActiveConversations();
        });

        // End or remove a conversation
        socket.on('end-conversation', (conversationId) => {
            delete activeConversations[conversationId];
            logger.info('[Conversation] Ended:', conversationId);
            broadcastActiveConversations();
        });

        // Client requests current active conversations
        socket.on('get-active-conversations', () => {
            socket.emit('active-conversations', Object.values(activeConversations));
            logger.info('[Request] get-active-conversations');
        });

        // ============================================
        // DISCONNECT (Shared)
        // ============================================
        
        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        });
    });

    logger.info('Socket.io initialized with chat and agent support');
    return io;
};

/**
 * Get Socket.io instance
 */
export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

/**
 * Emit message to a specific room
 */
export const emitToRoom = (roomId, clientId, event, data) => {
    if (!io) return;
    
    const room = `room_${roomId}_${clientId}`;
    io.to(room).emit(event, data);
};

/**
 * Emit new message event
 */
export const emitNewMessage = (roomId, clientId, message) => {
    emitToRoom(roomId, clientId, 'new_message', {
        id: message.id,
        content: message.content,
        sender_type: message.sender_type,
        created_at: message.created_at,
        metadata: message.metadata
    });
};

/**
 * Emit typing indicator
 */
export const emitTyping = (roomId, clientId, senderType, isTyping) => {
    emitToRoom(roomId, clientId, 'typing', {
        sender_type: senderType,
        is_typing: isTyping
    });
};

/**
 * Emit session update
 */
export const emitSessionUpdate = (roomId, clientId, update) => {
    emitToRoom(roomId, clientId, 'session_update', update);
};

export default {
    initializeSocket,
    getIO,
    emitToRoom,
    emitNewMessage,
    emitTyping,
    emitSessionUpdate
};