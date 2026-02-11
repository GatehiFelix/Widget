import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import axios from 'axios';

export const healthCheckController = asyncHandler(async (req, res) => {
  let qdrantStatus = 'unknown';
  let ollamaStatus = 'unknown';

  // Check Qdrant directly via HTTP
  try {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const response = await axios.get(`${qdrantUrl}/collections`, { 
      timeout: 5000 
    });
    qdrantStatus = response.status === 200 ? 'healthy' : 'unhealthy';
    logger.debug(`Qdrant health check: ${qdrantStatus}`);
  } catch (error) {
    logger.error(`Qdrant health check failed: ${error.message}`);
    qdrantStatus = 'unhealthy';
  }

  // Check Ollama directly via HTTP
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const response = await axios.get(`${ollamaUrl}/api/tags`, { 
      timeout: 5000 
    });
    ollamaStatus = response.status === 200 ? 'healthy' : 'unhealthy';
    logger.debug(`Ollama health check: ${ollamaStatus}`);
  } catch (error) {
    logger.error(`Ollama health check failed: ${error.message}`);
    ollamaStatus = 'unhealthy';
  }

  const healthy = qdrantStatus === 'healthy' && ollamaStatus === 'healthy';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      qdrant: qdrantStatus,
      ollama: ollamaStatus
    },
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.floor(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

export default healthCheckController;