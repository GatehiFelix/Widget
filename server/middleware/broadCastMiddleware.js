import  { getIO} from '@socket/index.js';

export const broadcastWidgetMessage = (messageData) => {
    try {
        const io = getIO();
        
        // Emit to agent app
        io.emit('agent-message', {
            conversationId: messageData.conversationId,
            messageId: messageData.id,
            content: messageData.content,
            senderType: messageData.sender_type,
            timestamp: messageData.created_at || new Date().toISOString(),
            metadata: messageData.metadata
        });
        
        console.log('[Widget] Broadcasted message to agent app:', messageData.id);
    } catch (error) {
        console.error('[Widget] Failed to broadcast message:', error.message);
        // Don't throw - let the message still go through even if broadcast fails
    }
};

export const startConversationBroadcast = (conversationData) => {
    try {
        const io = getIO();
        
        io.emit('active-conversations', [{
            id: conversationData.id,
            clientId: conversationData.client_id,
            status: 'active',
            startedAt: new Date().toISOString(),
            metadata: conversationData.metadata
        }]);
        
        console.log('[Widget] Conversation started broadcast:', conversationData.id);
    } catch (error) {
        console.error('[Widget] Failed to broadcast conversation start:', error.message);
    }
};