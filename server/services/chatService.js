import { Message, ChatRoom, User, Client } from "#models/index.js";
import { SessionContextService } from "#services/sessionService.js";
import { createQueryService } from "#services/queryService.js";
import { emitNewMessage, emitTyping } from "#socket/index.js";
import logger from "#utils/logger.js";
import { Op } from "sequelize";
import agentClient from "../src/integrations/crmClient.js";
import { fetchAgents, selectAgent } from "#services/agentService.js";
import { analyzeHandoverNeed } from "./handoverDetectionService.js";

const CONFIG = {
  MESSAGE_LIMIT: 50,
  CONTEXT_MESSAGES: 10,
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
const startSession = async (clientId, sessionToken, visitorId, roomId = null) => {
  if (!clientId || !sessionToken) {
    throw new Error("clientId and sessionToken are required");
  }

  const session = await SessionContextService.resumeOrCreateSession(
    clientId,
    sessionToken,
    visitorId,
    roomId || null,
  );

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
    content,
    sender_type: senderType,
    sender_id: senderId,
    metadata,
  });

  await SessionContextService.trackActivity(roomId, clientId);
  return message;
};

/**
 * Get recent messages for context
 */
const getRecentMessages = async (roomId, limit = CONFIG.CONTEXT_MESSAGES) => {
  const messages = await Message.findAll({
    where: { room_id: roomId },
    order: [["created_at", "DESC"]],
    limit,
  });

  return messages.reverse().map((m) => ({
    sender_type: m.sender_type,
    content: m.content,
    created_at: m.created_at,
  }));
};

/**
 * Send message to agent backend via socket.
 * Accepts optional pre-fetched room and client to avoid redundant DB calls.
 */
const sendMessageToAgent = async (message, room = null, client = null) => {
  try {
    const [resolvedRoom, resolvedClient] = await Promise.all([
      room ? Promise.resolve(room) : ChatRoom.findByPk(message.room_id),
      client ? Promise.resolve(client) : Client.findByPk(message.client_id),
    ]);

    const enriched = {
      id: message.id,
      conversation_id: message.room_id,
      client_id: message.client_id,
      content: message.content,
      sender_type: message.sender_type,
      created_at: message.created_at,
      metadata: message.metadata,
      name: resolvedClient?.name || "Unknown",
      email: resolvedRoom?.customer_email || "N/A",
      topic: resolvedRoom?.topic || "General Inquiry",
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
      takeover: !!resolvedRoom?.takeover,
    };

    agentClient.sendMessage(enriched);
  } catch (err) {
    logger.error("Failed to send message to agent backend via socket:", err.message);
  }
};

/**
 * Process customer message and get AI response
 */
const processMessage = async (clientId, roomId, content) => {
  if (!clientId || !roomId || !content) {
    throw new Error("clientId, roomId, and content are required");
  }

  // 1. Save and emit customer message
  const customerMessage = await saveMessage(roomId, clientId, content, "customer");
  emitNewMessage(roomId, clientId, customerMessage);
  logger.info(`Customer message saved: ${customerMessage.id}`);

  // 2. Fetch context, history, room and client in parallel
  const [conversationHistory, context, chatRoom, resolvedClient] = await Promise.all([
    getRecentMessages(roomId),
    SessionContextService.getOrCreateContext(roomId, clientId),
    ChatRoom.findOne({ where: { id: roomId, client_id: clientId } }),
    Client.findByPk(clientId),
  ]);

  // Send customer message to agent backend — pass resolved room/client to avoid re-fetch
  await sendMessageToAgent(customerMessage, chatRoom, resolvedClient);
  emitTyping(roomId, clientId, "ai", true);

  // 3. Handover detection
  const handoverResult = analyzeHandoverNeed(content, conversationHistory, {
    collectedEntities: context?.collected_entities || {},
  });

  // ── Helpers ────────────────────────────────────────────────

  const pickAgent = async () => {
    const agents = await fetchAgents(clientId);
    return selectAgent(agents);
  };

  const assignAgent = async (agent) => {
    await ChatRoom.update(
      {
        assigned_agent_id: agent.id,
        assigned_agent_email: agent.email,
        agent_source: "external",
        takeover: true,
      },
      { where: { id: roomId, client_id: clientId } },
    );

    const updatedEntities = {
      ...context.collected_entities,
      assignedAgentEmail: agent.email,
      assignedAgentName: agent.name,
    };

    await SessionContextService.updateEntities(roomId, clientId, {
      collected_entities: updatedEntities,
    });
    context.collected_entities = updatedEntities;

    const msg = await saveMessage(
      roomId,
      clientId,
      `You are now connected with ${agent.name}. How can they help you today?`,
      "system",
    );
    emitNewMessage(roomId, clientId, msg);

    agentClient.notifyHandover({
      agentEmail: agent.email,
      agentName: agent.name,
      roomId,
      clientId,
      customerEmail: context.collected_entities?.customer_email || "N/A",
    });

    return msg;
  };

  // ── Handover branching ─────────────────────────────────────

  if (handoverResult?.shouldHandover) {
    if (!handoverResult.immediate) {
      // ASSISTED — fall through intentionally so AI collects customer identity first.
      // Handover triggers in step 5b once identity (email/name/phone) is confirmed.
      const updatedEntities = {
        ...context?.collected_entities,
        pendingHandover: true,
        handoverReason: handoverResult.reason,
      };
      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: updatedEntities,
      });
      context.collected_entities = updatedEntities;

    } else {
      // IMMEDIATE — hand over right now
      logger.info(`Immediate handover triggered: ${handoverResult.reason}`);

      if (chatRoom?.assigned_agent_id) {
        // Agent already assigned — just remind the customer
        const agentName =
          context.collected_entities?.assignedAgentName || "your assigned agent";

        const msg = await saveMessage(
          roomId,
          clientId,
          `You are currently being assisted by ${agentName}. How can they help you today?`,
          "system",
        );
        emitNewMessage(roomId, clientId, msg);
        emitTyping(roomId, clientId, "ai", false);

        return {
          handover: true,
          reason: handoverResult.reason,
          message: handoverResult.message,
          customerMessage,
          assignedAgent: null,
        };
      }

      // No agent yet — pick one
      const agent = await pickAgent();

      if (agent) {
        await assignAgent(agent);
      } else {
        await saveMessage(
          roomId,
          clientId,
          "All our agents are currently busy. Please wait and someone will be with you shortly.",
          "system",
        );
      }

      emitTyping(roomId, clientId, "ai", false);

      return {
        handover: true,
        reason: handoverResult.reason,
        message: handoverResult.message,
        customerMessage,
        assignedAgent: agent ?? null,
      };
    }
  }

  // ── RAG flow ───────────────────────────────────────────────

  try {
    // 4. Init query service
    const qs = await getQueryService();

    // 5. LLM-powered entity extraction
    const extractedEntities = await qs.extractEntities(
      content,
      context.collected_entities || {},
    );

    if (Object.keys(extractedEntities).length > 0) {
      logger.info(`Extracted entities: ${JSON.stringify(extractedEntities)}`);
      context.collected_entities = {
        ...context.collected_entities,
        ...extractedEntities,
      };

      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: context.collected_entities,
      });

      const roomUpdates = {};
      if (extractedEntities.email) roomUpdates.customer_email = extractedEntities.email;
      if (extractedEntities.name) roomUpdates.customer_name = extractedEntities.name;
      if (Object.keys(roomUpdates).length > 0) {
        await ChatRoom.update(roomUpdates, {
          where: { id: roomId, client_id: clientId },
        });
      }
    }

    // 5b. Pending handover unblocked — identity now available
    if (
      context.collected_entities?.pendingHandover &&
      (extractedEntities.email || extractedEntities.name || extractedEntities.phone)
    ) {
      const handoverReason = context.collected_entities.handoverReason;

      delete context.collected_entities.pendingHandover;
      delete context.collected_entities.handoverReason;

      await SessionContextService.updateContext(roomId, clientId, {
        collected_entities: context.collected_entities,
      });

      const agent = await pickAgent();
      if (agent) {
        await assignAgent(agent);
        emitTyping(roomId, clientId, "ai", false);
        return {
          handover: true,
          reason: handoverReason,
          customerMessage,
          assignedAgent: agent,
        };
      }
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
      answerText =
        typeof ragResponse.answer === "string"
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

    // 8. Save and emit AI response
    const aiMessage = await saveMessage(roomId, clientId, answerText, "ai", {
      sources: ragResponse?.sources || [],
      intent: ragResponse?.intent || null,
      confidence: ragResponse?.confidence ?? null,
      queryDuration,
    });

    emitNewMessage(roomId, clientId, aiMessage);
    logger.info(`AI message saved: ${aiMessage.id}`);

    // Pass resolved room/client again to avoid re-fetch
    await sendMessageToAgent(aiMessage, chatRoom, resolvedClient);

    // 9. Merge any entities the RAG pipeline extracted
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
      roomId,
      clientId,
      "I apologize, but I encountered an error processing your request. Please try again.",
      "ai",
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
    throw new Error("roomId and clientId are required");
  }

  return Message.findAll({
    where: { room_id: roomId, client_id: clientId },
    order: [["created_at", "ASC"]],
    limit,
  });
};

/**
 * Get conversation summaries for a client
 */
const getConversationSummaries = async (clientId, visitorId) => {
  if (!clientId || !visitorId)
    throw new Error("clientId and visitorId are required");

  const chatrooms = await ChatRoom.findAll({
    where: { client_id: clientId, widget_visitor_id: visitorId },
    order: [["last_activity_at", "DESC"]],
  });

  return Promise.all(
    chatrooms.map(async (room) => {
      const lastMessage = await Message.findOne({
        where: { room_id: room.id, client_id: clientId },
        order: [["created_at", "DESC"]],
      });
      return {
        roomId: room.id,
        startedAt: room.created_at,
        endedAt: room.ended_at,
        lastMessage: lastMessage?.content || "",
        lastMessageAt: lastMessage?.created_at || null,
      };
    }),
  );
};

/**
 * Escalate chat to a local/internal human agent
 */
const escalateToAgent = async (roomId, clientId) => {
  if (!roomId || !clientId) {
    throw new Error("roomId and clientId are required");
  }

  const availableAgent = await User.findOne({
    where: {
      client_id: clientId,
      role: "agent",
      current_chat_count: { [Op.lt]: Op.col("max_concurrent_chats") },
    },
    order: [["current_chat_count", "ASC"]],
  });

  if (!availableAgent) {
    await saveMessage(
      roomId,
      clientId,
      "All our agents are currently busy. Please wait and someone will be with you shortly.",
      "system",
    );
    return { assigned: false, message: "No agents available" };
  }

  await ChatRoom.update(
    { assigned_agent_id: availableAgent.id },
    { where: { id: roomId, client_id: clientId } },
  );

  await User.increment("current_chat_count", {
    where: { id: availableAgent.id },
  });

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

  const message = await saveMessage(roomId, clientId, content, "agent", null, agentId);
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

  const room = await ChatRoom.findOne({
    where: { id: roomId, client_id: clientId },
  });

  if (!room) throw new Error("Chat room not found");

  if (room.assigned_agent_id) {
    await User.decrement("current_chat_count", {
      where: { id: room.assigned_agent_id },
    });
  }

  await SessionContextService.closeSession(roomId, clientId);

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