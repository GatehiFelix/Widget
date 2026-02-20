// src/clients/agentBackendClient.js

import { io } from "socket.io-client";
import fetch from "node-fetch";
import logger from "#utils/logger.js";

/**
 * AgentBackendClient
 * 
 * Single client that owns ALL communication with the agent backend.
 * Both socket (real-time) and REST (request/response) go through here.
 */
class AgentBackendClient {
  constructor() {
    this.baseUrl = process.env.AGENT_BACKEND_URL || "http://localhost:5000";
    this.apiKey = process.env.INTERNAL_API_KEY;
    this.socketNamespace = "/widget";

    this._socket = null;
    this._isReady = false;
    this._messageHandlers = new Map();
    this._pendingAcks = new Map();
    this._ackTimeout = 8000; // 8s timeout for ack-based calls
  }

  // ─────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────

  connect() {
    if (this._socket?.connected) return this;

    const url = `${this.baseUrl}${this.socketNamespace}`;
    logger.info(`[AgentClient] Connecting to ${url}`);

    this._socket = io(url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity, // keep trying — agent backend may restart
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,   // cap backoff at 30s
      randomizationFactor: 0.3,
      auth: { apiKey: this.apiKey }, // pass key on handshake
    });

    this._socket.on("connect", () => {
      this._isReady = true;
      logger.info(`[AgentClient] Connected — socket: ${this._socket.id}`);
    });

    this._socket.on("disconnect", (reason) => {
      this._isReady = false;
      logger.warn(`[AgentClient] Disconnected — reason: ${reason}`);
    });

    this._socket.on("connect_error", (err) => {
      logger.error(`[AgentClient] Connection error: ${err.message}`);
    });

    // Route all inbound events to registered handlers
    this._socket.onAny((event, data) => {
      const handler = this._messageHandlers.get(event);
      if (handler) handler(data);
    });

    return this;
  }

  get isReady() {
    return this._isReady && this._socket?.connected;
  }

  // ─────────────────────────────────────────────
  // HANDLER REGISTRATION (inbound events)
  // ─────────────────────────────────────────────

  on(event, handler) {
    this._messageHandlers.set(event, handler);
    return this;
  }

  off(event) {
    this._messageHandlers.delete(event);
    return this;
  }

  // ─────────────────────────────────────────────
  // SOCKET METHODS (real-time, fire-and-forget)
  // ─────────────────────────────────────────────

  /**
   * Send a chat message to the agent widget namespace
   */
  sendMessage(messageData) {
    this._emit("widget_message", messageData);
  }

  /**
   * Notify the agent backend that a conversation needs agent handover
   */
  notifyHandover(handoverData) {
    this._emit("agent_assigned", handoverData);
  }

  /**
   * Join a conversation room on the agent backend
   */
  joinConversation(conversationId) {
    this._emit("join_widget_conversation", { conversation_id: conversationId });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId) {
    this._emit("leave_widget_conversation", { conversation_id: conversationId });
  }

  // ─────────────────────────────────────────────
  // SOCKET METHODS (with acknowledgement)
  // ─────────────────────────────────────────────

  /**
   * Emit with acknowledgement — use for critical events where
   * you need confirmation the other side received and processed it.
   */
  emitWithAck(event, data, timeoutMs = this._ackTimeout) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) {
        return reject(new Error("[AgentClient] Socket not connected"));
      }

      const timer = setTimeout(() => {
        reject(new Error(`[AgentClient] Ack timeout for event: ${event}`));
      }, timeoutMs);

      this._socket.emit(event, data, (ack) => {
        clearTimeout(timer);
        if (ack?.error) return reject(new Error(ack.error));
        resolve(ack);
      });
    });
  }

  // ─────────────────────────────────────────────
  // REST METHODS
  // ─────────────────────────────────────────────

  /**
   * Fetch available agents for a given product/department
   */
  async getAgentsForProduct(productId) {
    return this._apiGet(`/api/internal/widget-agents/${productId}`);
  }

  /**
   * Assign an agent to a handover ticket
   */
  async assignAgent(handoverId, agentId) {
    return this._apiPost(`/api/internal/assign-agent`, {
      handover_id: handoverId,
      agent_id: agentId,
    });
  }

  /**
   * Create a handover/escalation record on the agent backend
   */
  async createHandover(payload) {
    return this._apiPost(`/api/internal/handovers`, payload);
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  _emit(event, data) {
    if (!this.isReady) {
      logger.warn(`[AgentClient] Tried to emit '${event}' but socket not ready. Queuing not implemented yet.`);
      return;
    }
    this._socket.emit(event, data);
  }

  async _apiGet(path) {
    return this._apiRequest("GET", path);
  }

  async _apiPost(path, body) {
    return this._apiRequest("POST", path, body);
  }

  async _apiRequest(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
    };

    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[AgentClient] ${method} ${path} → ${res.status}: ${text}`);
      }
      return res.json();
    } catch (err) {
      logger.error(`[AgentClient] REST error: ${err.message}`);
      throw err;
    }
  }
}

// Inside AgentBackendClient class


// Singleton — one client instance per process
const agentClient = new AgentBackendClient();
export default agentClient;