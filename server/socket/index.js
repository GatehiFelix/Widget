
import { Server } from 'socket.io';
import logger from '#utils/logger.js';

let io = null;

/**
 * Initialize Socket.io server
 */
export const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id}`);

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

        // Disconnect
        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        });
    });

    logger.info('Socket.io initialized');
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
