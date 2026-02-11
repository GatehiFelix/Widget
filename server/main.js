import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import 'colors';
import { createRAGApplication } from './index.js';
import { syncModels } from './models/index.js';
import { initializeSocket} from './socket/index.js';
import tenantRoutes from './routes/tenantRoutes.js';
import documentRoutes from './routes/documentsRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import logger from './utils/logger.js';
import {cleanAllCollections} from './utils/cleanQdrantDB.js';


dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

//middleware
app.use(express.json());

let ragApp;

const initializeRAG = async () => {
    try {
        logger.info('Initializing RAG Application...');

        // Let the services use environment variables for configuration
        // LLM_PROVIDER and EMBEDDING_PROVIDER determine which backend to use
        ragApp  = await createRAGApplication({
            qdrant: { url: process.env.QDRANT_URL},
            // Don't override modelName - let it use env vars based on provider
            llm: {},
            embedding: {}
        });

        logger.info('RAG Application initialized successfully.');
    } catch (error) {
        logger.error('Error initializing RAG Application:', error);
        process.exit(1);
    }
};


app.use((req, res, next) => {
  req.ragApp = ragApp;
  next();
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

// Start server
const startServer = async () => {
  try {
    // Sync database tables first
    await syncModels({ alter: true });
    
    // Initialize RAG
    await initializeRAG();
    
    // Initialize Socket.io
    initializeSocket(server);
    // Initialize Agent Socket for widget/agent integration
    // initializeAgentSocket(server);
    
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`.green.bold);
      console.log(`🔌 Socket.io ready for connections`.cyan);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();

// cleanAllCollections();


export default app;