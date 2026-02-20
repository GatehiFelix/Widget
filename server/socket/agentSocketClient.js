import { io } from "socket.io-client";

import { ChatService } from "#services/chatService.js";
import { emitNewMessage } from "#socket/index.js";

const AGENT_SOCKET_URL = process.env.AGENT_SOCKET_URL || "http://localhost:5000/widget";
const agentSocket = io(AGENT_SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});

// Log connection status
agentSocket.on("connect", () => {
  console.log("[RAG] Connected to Agent Widget Namespace:", agentSocket.id);
});
agentSocket.on("disconnect", () => {
  console.log("[RAG] Disconnected from Agent Widget Namespace");
});

// Listen for agent messages
agentSocket.on("widget_message_received", (msg) => {
  // Handle agent message: emit to user UI, save to DB, etc.
  console.log("[RAG] Received agent message:", msg);
  // Example: emitNewMessage(msg.roomId, msg.clientId, msg);
});

agentSocket.on("agent_assigned", async (msg) => {
  console.log("[RAG] Received agent assignment notification:", msg);
  // Optionally, you can also emit this to the user UI or handle it as needed

  try {
    const { roomId, clientId, content, agentId } = msg;

    if(!roomId || !clientId || !content) return;

    const saved = await ChatService.saveMessage(roomId, clientId, content, "agent", null, agentId || null);
    emitNewMessage(roomId, clientId, saved);
  } catch (error) {
    console.error("[RAG] Error handling agent assignment notification:", error.message);
  }
})

// Export a function to send messages to agents
export function sendMessageToAgentWidget(messageData) {
    // console.log("[RAG] Sending message to agent widget:", messageData);
  agentSocket.emit("widget_message", messageData);
}

export function sendAgentAssignmentNotification(notificationData) {
  console.log("[RAG] Sending agent assignment notification:", notificationData);
  agentSocket.emit("agent_assigned", notificationData);
}

export default agentSocket;

