import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  
  // Qdrant Configuration
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
    defaultCollection: process.env.QDRANT_COLLECTION || 'documents'
  },
  
  // LLM Configuration
  llm: {
    provider: process.env.LLM_PROVIDER || 'ollama',
  },
  
  // Ollama Configuration
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    llmModel: process.env.LLM_MODEL || 'gemma2:2b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text:latest',
  },

  // Gemini Configuration
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  
  // RAG Configuration
  rag: {
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 100,
    kDocuments: parseInt(process.env.K_DOCUMENTS) || 3,
    temperature: parseFloat(process.env.TEMPERATURE) || 0,
    numPredict: parseInt(process.env.NUM_PREDICT) || 256,
    numCtx: parseInt(process.env.NUM_CTX) || 2048,
  },
  
  // Application
  app: {
    port: parseInt(process.env.PORT) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  
  // Paths
  paths: {
    data: process.env.DATA_PATH || './data',
    documents: process.env.DOCUMENTS_PATH || './data/documents',
    cache: process.env.CACHE_PATH || './data/cache',
    logs: process.env.LOGS_PATH || './data/logs',
  }
};

export default config;
