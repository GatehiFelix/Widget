import express from "express";
import http from "http";
import dotenv from "dotenv";
import "colors";
import { createRAGApplication } from "./index.js";
import { syncModels } from "./models/index.js";
import { initializeSocket } from "./socket/index.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import documentRoutes from "./routes/documentsRoutes.js";
import queryRoutes from "./routes/queryRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import supportAgentRoutes from "./routes/supportAgentRoutes.js";
import widgetScriptRoutes from "./routes/widgetScriptRoutes.js";
import logger from "./utils/logger.js";
import agentClient from "./src/integrations/crmClient.js";
import { ChatService } from "#services/chatService.js";
import { emitNewMessage } from "#socket/index.js";
import { getIO } from "./socket/index.js";
import cors from "cors";


dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 6000;

app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ],
  credentials: true
}));

let ragApp;

const initializeRAG = async () => {
  try {
    logger.info("Initializing RAG Application...");
    ragApp = await createRAGApplication({
      qdrant: { url: process.env.QDRANT_URL },
      llm: {},
      embedding: {},
    });
    logger.info("RAG Application initialized successfully.");
  } catch (error) {
    logger.error("Error initializing RAG Application:", error);
    process.exit(1);
  }
};


agentClient
  .connect()
  .on("agent_assigned", async (msg) => {
    // Agent backend confirmed assignment — save system confirmation
    try {
      const { roomId, clientId, agentName } = msg;
      if (!roomId || !clientId) return;

      const saved = await ChatService.saveMessage(
        roomId,
        clientId,
        `Agent ${agentName || "support"} has joined the conversation.`,
        "system",
      );
      emitNewMessage(roomId, clientId, saved);
    } catch (err) {
      logger.error("[AgentClient] agent_assigned error:", err.message);
    }
  });

  setTimeout(() => {
  console.log("AgentClient isReady:", agentClient.isReady);
  console.log("AgentClient socket connected:", agentClient._socket?.connected);
  console.log("AgentClient baseUrl:", agentClient.baseUrl);
  console.log("AgentClient apiKey:", agentClient.apiKey);
}, 3000);

app.use((req, res, next) => {
  req.ragApp = ragApp;
  next();
});

app.use("/api/health", healthRoutes);
app.use("/api/query", queryRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/agents", supportAgentRoutes);
app.use(widgetScriptRoutes);

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

const startServer = async () => {
  try {
    await syncModels({ alter: true });
    await initializeRAG();
    initializeSocket(server);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`.green.bold);
      console.log(`Socket.io ready`.cyan);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();

export default app;
