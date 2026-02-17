import { io } from "socket.io-client";

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

// Export a function to send messages to agents
export function sendMessageToAgentWidget(messageData) {
  agentSocket.emit("widget_message", messageData);
}

export default agentSocket;