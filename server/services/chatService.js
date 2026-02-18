import { Message, ChatRoom, User, Client } from "#models/index.js";
import { SessionContextService } from "#services/sessionService.js";
import { createQueryService } from "#services/queryService.js";
import { emitNewMessage, emitTyping } from "#socket/index.js";
import logger from "#utils/logger.js";
import { Op } from "sequelize";
import { sendMessageToAgentWidget } from "#socket/agentSocketClient.js";
import  extractEntities  from "./queryService.js";
import { analyzeHandoverNeed } from "./handoverDetectionService.js";
import { getExternalAgents } from "./externalAgentDbService.js";
 
const CONFIG = {
  MESSAGE_LIMIT: 50,
  CONTEXT_MESSAGES: 10, // Last N messages for RAG context
  SESSION_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
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

const startSession = async (
  clientId,
  sessionToken,
  visitorId,
  roomId = null,
) => {
  if (!clientId || !sessionToken) {
    throw new Error("clientId and sessionToken are required");
  }

  let session;
  if (roomId) {
    session = await SessionContextService.resumeOrCreateSession(
      clientId,
      sessionToken,
      visitorId,
      roomId,
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
    isNewSession: session.messages.length === 0,
  };
};

/**
 * Save a message to the database
 */
const saveMessage = async (
  roomId,
  clientId,
  content,
  senderType,
  metadata = null,
  senderId = null,
) => {
  if (!roomId || !clientId || !content) {
    throw new Error("roomId, clientId, and content are required");
  }

  const message = await Message.create({
    room_id: roomId,
    client_id: clientId,
    content: content,
    sender_type: senderType,
    sender_id: senderId,
    metadata: metadata,
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
    order: [["created_at", "DESC"]], // Get most recent first
    limit: limit,
  });

  // Reverse to get chronological order (oldest to newest)
  return messages.reverse().map((m) => ({
    sender_type: m.sender_type,
    content: m.content,
    created_at: m.created_at,
  }));
};

/**
 * Send message to agent backend via socket
 */
const sendMessageToAgent = async (message) => {
  try {
    // Fetch related room and client for enrichment
    const room = await ChatRoom.findByPk(message.room_id);
    const client = await Client.findByPk(message.client_id);

    // Compose enriched payload
    const enriched = {
      id: message.id,
      conversation_id: message.room_id,
      client_id: message.client_id,
      content: message.content,
      sender_type: message.sender_type,
      created_at: message.created_at,
      metadata: message.metadata,
      name: client?.name || "Unknown",
      email: room?.customer_email || "N/A",
      topic: room?.topic || "General Inquiry",
      status:
        message.sender_type === "ai"
          ? "AI Handling"
          : message.sender_type === "agent"
            ? "Agent Handling"
            : "Customer",
      statusColor:
        message.sender_type === "ai"
          ? "blue.600"
          : message.sender_type === "agent"
            ? "orange.600"
            : "green.600",
      lastMessage: message.content,
      time: message.created_at,
      confidence: message.metadata?.confidence
        ? `${message.metadata.confidence}%`
        : null,
      takeover: !!room?.takeover, // assumes takeover is a boolean field on ChatRoom
    };
    sendMessageToAgentWidget(enriched);
  } catch (err) {
    logger.error(
      "Failed to send message to agent backend via socket:",
      err.message,
    );
  }
};



/**
 * Process customer message and get AI response
 */

const processMessage = async (clientId, roomId, content) => {
  if (!clientId || !roomId || !content) {
    throw new Error("clientId, roomId, and content are required");
  }

  // 1. Save customer message
  logger.info(`[TRACE] Saving customer message for room ${roomId}, client ${clientId}`);
  const customerMessage = await saveMessage(roomId, clientId, content, "customer");
  emitNewMessage(roomId, clientId, customerMessage);
  logger.info(`[TRACE] Customer message saved and emitted: ${customerMessage.id}`);
  await sendMessageToAgent(customerMessage);

  // 2. Handover detection
  logger.info(`[TRACE] Running handover detection for room ${roomId}, client ${clientId}`);
  const conversationHistory = await getRecentMessages(roomId);
  const context = await SessionContextService.getOrCreateContext(roomId, clientId);

  const handoverResult = analyzeHandoverNeed(content, conversationHistory, {
    collectedEntities: context?.collected_entities || {},
  });

  logger.info(`[TRACE] Handover analysis result: ${JSON.stringify(handoverResult)}`);

  if (handoverResult?.shouldHandover) {
    if (!handoverResult.immediate) {
      logger.info(`[TRACE] ASSISTED handover detected. Flagging pending handover in context for room ${roomId}`);
      // ASSISTED — flag pending handover, fall through to AI to collect identity
      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: {
          ...context?.collected_entities,
          pendingHandover: true,
          handoverReason: handoverResult.reason,
        }
      });
      // Update local context so steps below see the flag
      context.collected_entities = {
        ...context?.collected_entities,
        pendingHandover: true,
        handoverReason: handoverResult.reason,
      };
    } else {
    // IMMEDIATE — hand over right away
    logger.info(`[TRACE] IMMEDIATE handover: ${handoverResult.reason} - ${handoverResult.message}`);
    logger.info(`[TRACE] Fetching external agents for client ${clientId}`);
    const agents = await getExternalAgents(clientId);
    logger.info(`[TRACE] getExternalAgents returned: ${agents?.length ? agents.map(a => a.name + ' (id:' + a.id + ')').join(', ') : 'No agents found'}`);

    // Filter out agents with invalid ids (e.g. id:0 from CRM)
    const validAgents = agents?.filter(a => a.email) || [];

    if (validAgents.length > 0) {
        const assignedAgent = validAgents.sort(
          (a, b) => (a.current_chat_count || 0) - (b.current_chat_count || 0)
        )[0];

        logger.info(`[TRACE] Assigning agent ${assignedAgent.name} to room ${roomId}`);

        let user;
        try {
          // Use EMAIL as lookup key — CRM ids are not reliable (e.g. id:0)
          // This creates the agent in local users table if they don't exist yet
          // which is required because chat_rooms.assigned_agent_id is a FK to users.id
          [user] = await User.findOrCreate({
            where: { email: assignedAgent.email },
            defaults: {
              name: assignedAgent.name || 'Agent',
              email: assignedAgent.email,
              role: 'agent',
              status: 'online',
              client_id: clientId
            }
          });
          logger.info(`[TRACE] Local user ready for agent: ${user.name} (local id:${user.id})`);
        } catch (err) {
          logger.error(`[ERROR] Failed to create/find user for agent: ${err.message}`);
          await saveMessage(roomId, clientId, "All our agents are currently busy. Please wait.", "system");
          return { handover: true, reason: handoverResult.reason, customerMessage, assignedAgent: null };
        }

        try {
          // Use local user.id (NOT assignedAgent.id from CRM) to satisfy FK constraint
          await ChatRoom.update(
            { assigned_agent_id: user.id, takeover: true },
            { where: { id: roomId, client_id: clientId } }
          );
        } catch (err) {
          logger.error(`[ERROR] Failed to update ChatRoom: ${err.message}`);
        }

        logger.info(`[TRACE] Sending agent assignment AI message: You are now connected with ${user.name}. They will be reaching out to you shortly.`);
        const aiMessage = await saveMessage(
          roomId, clientId,
          `You are now connected with ${user.name}. They will be reaching out to you shortly.`,
          "ai"
        );
        emitNewMessage(roomId, clientId, aiMessage)
        logger.info(`[TRACE] Agent assignment AI message sent for room ${roomId}, client ${clientId}`);

        return { handover: true, reason: handoverResult.reason, message: handoverResult.message, customerMessage, assignedAgent: user };

    } else {
        logger.info(`[TRACE] No valid agents available for immediate handover in room ${roomId}`);
        await saveMessage(roomId, clientId, "All our agents are currently busy. Please wait and someone will be with you shortly.", "system");
    }

    return { handover: true, reason: handoverResult.reason, message: handoverResult.message, customerMessage, assignedAgent: null };
}
  }

  // 3. Typing indicator
  emitTyping(roomId, clientId, "ai", true);

  try {
    // 4. Init query service (context already fetched above)
    const qs = await getQueryService();

    // 5. LLM-powered entity extraction
    const extractedEntities = await qs.extractEntities(content, context.collected_entities || {});
    if (Object.keys(extractedEntities).length > 0) {
      logger.info(`[TRACE] Extracted entities: ${JSON.stringify(extractedEntities)}`);
      context.collected_entities = { ...context.collected_entities, ...extractedEntities };

      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: context.collected_entities,
      });

      const roomUpdates = {};
      if (extractedEntities.email) roomUpdates.customer_email = extractedEntities.email;
      if (extractedEntities.name)  roomUpdates.customer_name  = extractedEntities.name;
      if (Object.keys(roomUpdates).length > 0) {
        await ChatRoom.update(roomUpdates, { where: { id: roomId, client_id: clientId } });
      }
    }

    // 5b. Check if pending handover is now unblocked by newly collected identity
    if (context.collected_entities?.pendingHandover &&
        (extractedEntities.email || extractedEntities.name || extractedEntities.phone)) {

      logger.info(`[TRACE] Pending handover now unblocked by collected identity for room ${roomId}`);
      const handoverReason = context.collected_entities.handoverReason;

      // Clean up flags before handing over
      delete context.collected_entities.pendingHandover;
      delete context.collected_entities.handoverReason;
      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: context.collected_entities
      });

      logger.info(`[TRACE] Fetching external agents for client ${clientId} (pending handover)`);
      const agents = await getExternalAgents(clientId, { status: "online", requireAvailability: true });
      logger.info(`[TRACE] getExternalAgents (pending handover) returned: ${agents && agents.length ? agents.map(a => a.name + ' (id:' + a.id + ')').join(', ') : 'No agents found'}`);
      if (agents && agents.length > 0) {
        const assignedAgent = agents.sort((a, b) => (a.current_chat_count || 0) - (b.current_chat_count || 0))[0];
        logger.info(`[TRACE] Assigning agent ${assignedAgent.name} (id:${assignedAgent.id}) to room ${roomId} (pending handover)`);
        await ChatRoom.update(
          { assigned_agent_id: assignedAgent.id, takeover: true },
          { where: { id: roomId, client_id: clientId } }
        );
        await saveMessage(roomId, clientId, `You are now connected with ${assignedAgent.name}. How can they help you today?`, "system");
        emitTyping(roomId, clientId, "ai", false);
        return { handover: true, reason: handoverReason, customerMessage, assignedAgent };
      }
      logger.info(`[TRACE] No agents available for pending handover in room ${roomId}`);
      // No agents available — fall through and let AI respond
    }

    // 6. Query RAG
    const startTime = Date.now();
    const ragResponse = await qs.query(String(clientId), content, {
      conversationHistory,
      context: context.collected_entities,
    });
    const queryDuration = Date.now() - startTime;
    logger.info(`Query completed in ${queryDuration}ms for tenant ${clientId}`);

    emitTyping(roomId, clientId, "ai", false);

    // 7. Extract answer text
    let answerText = "";
    if (typeof ragResponse === "string") {
      answerText = ragResponse;
    } else if (ragResponse?.text) {
      answerText = ragResponse.text;
    } else if (ragResponse?.answer) {
      answerText = typeof ragResponse.answer === "string"
        ? ragResponse.answer
        : ragResponse.answer?.text || String(ragResponse.answer);
    } else if (ragResponse?.response) {
      answerText = ragResponse.response;
    } else if (ragResponse?.content) {
      answerText = ragResponse.content;
    } else {
      answerText = "I apologize, but I could not generate a proper response.";
    }
    answerText = answerText.trim();

    // 8. Save AI response
    const aiMessage = await saveMessage(roomId, clientId, answerText, "ai", {
      sources: ragResponse?.sources || [],
      intent: ragResponse?.intent || null,
      confidence: ragResponse?.confidence ?? null,
      queryDuration,
    });

    emitNewMessage(roomId, clientId, aiMessage);
    console.log("AI message saved and emitted:", aiMessage.id);
    await sendMessageToAgent(aiMessage);

    // 9. Merge any entities RAG pipeline extracted
    if (ragResponse?.extractedEntities) {
      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: {
          ...context.collected_entities,
          ...ragResponse.extractedEntities,
        },
      });
    }

    return { customerMessage, aiMessage, sources: ragResponse?.sources || [] };

  } catch (error) {
    logger.error("Error processing message:", error);
    emitTyping(roomId, clientId, "ai", false);

    const errorMessage = await saveMessage(
      roomId, clientId,
      "I apologize, but I encountered an error processing your request. Please try again.",
      "ai"
    );
    emitNewMessage(roomId, clientId, errorMessage);
    throw error;
  }
};

/**
 * Get chat history
 */

const getChatHistory = async (
  roomId,
  clientId,
  limit = CONFIG.MESSAGE_LIMIT,
) => {
  if (!roomId || !clientId) {
    throw new Error("roomId and clientId are required");
  }

  const messages = await Message.findAll({
    where: {
      room_id: roomId,
      client_id: clientId,
    },
    order: [["created_at", "ASC"]],
    limit: limit,
  });

  return messages;
};

/**
 * get conversation summaries for a client
 */

const getConversationSummaries = async (clientId, visitorId) => {
  if (!clientId || !visitorId)
    throw new Error("clientId and visitorId are required");

  const chatrooms = await ChatRoom.findAll({
    where: { client_id: clientId, widget_visitor_id: visitorId },
    order: [["last_activity_at", "DESC"]],
  });

  const summaries = await Promise.all(
    chatrooms.map(async (room) => {
      const lastMessage = await Message.findOne({
        where: { room_id: room.id, client_id: clientId },
        order: [["created_at", "DESC"]],
      });
      return {
        roomId: room.id,
        startedAt: room.created_at,
        endedAt: room.ended_at,
        lastMessage: lastMessage ? lastMessage.content : "",
        lastMessageAt: lastMessage ? lastMessage.created_at : null,
      };
    }),
  );

  return summaries;
};

/**
 * Escalate chat to human agent
 */

const escalateToAgent = async (roomId, clientId) => {
  if (!roomId || !clientId) {
    throw new Error("roomId and clientId are required");
  }

  // Find available agent
  const availableAgent = await User.findOne({
    where: {
      client_id: clientId,
      role: "agent",
      status: "online",
      current_chat_count: {
        [Op.lt]: Op.col("max_concurrent_chats"),
      },
    },
    order: [["current_chat_count", "ASC"]],
  });

  if (!availableAgent) {
    // No agent available - save system message
    await saveMessage(
      roomId,
      clientId,
      "All our agents are currently busy. Please wait and someone will be with you shortly.",
      "system",
    );

    return { assigned: false, message: "No agents available" };
  }

  // Assign agent to room
  await ChatRoom.update(
    { assigned_agent_id: availableAgent.id },
    { where: { id: roomId, client_id: clientId } },
  );

  // Increment agent's chat count
  await User.increment("current_chat_count", {
    where: { id: availableAgent.id },
  });

  // Save system message
  await saveMessage(
    roomId,
    clientId,
    `You are now connected with ${availableAgent.name}. How can they help you today?`,
    "system",
  );

  return {
    assigned: true,
    agentId: availableAgent.id,
    agentName: availableAgent.name,
  };
};

/**
 * Send message from agent to customer
 */

const sendAgentMessage = async (roomId, clientId, agentId, content) => {
  if (!roomId || !clientId || !agentId || !content) {
    throw new Error("roomId, clientId, agentId, and content are required");
  }

  const message = await saveMessage(
    roomId,
    clientId,
    content,
    "agent",
    null,
    agentId,
  );

  emitNewMessage(roomId, clientId, message);

  return message;
};

/**
 * Close chat session
 */

const closeSession = async (roomId, clientId) => {
  if (!roomId || !clientId) {
    throw new Error("roomId and clientId are required");
  }

  // Get room to check for assigned agent
  const room = await ChatRoom.findOne({
    where: { id: roomId, client_id: clientId },
  });

  if (!room) {
    throw new Error("Chat room not found");
  }

  // Decrement agent's chat count if assigned
  if (room.assigned_agent_id) {
    await User.decrement("current_chat_count", {
      where: { id: room.assigned_agent_id },
    });
  }

  // Close session via SessionService
  await SessionContextService.closeSession(roomId, clientId);

  // Save system message
  await saveMessage(
    roomId,
    clientId,
    "This chat session has been closed. Thank you for contacting us!",
    "system",
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
  getRecentMessages,
};
