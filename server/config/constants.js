export const RAG_CONFIG = {
  kDocuments: 3,              
  chunkSize: 1500,         
  chunkOverlap: 150,          
  defaultPromptType: 'fast',  
};

export const OLLAMA_CONFIG = {
  defaultModel: 'llama2',
  defaultBaseUrl: 'http://localhost:11434',
  defaultTemperature: 0.7,
  numPredict: 256,           
  numCtx: 2048,             
};

export const EMBEDDING_CONFIG = {
  defaultModel: 'nomic-embed-text',
  batchSize: 20,             
  cacheEnabled: true,        
};

export const QDRANT_CONFIG = {
  defaultCollection: 'documents',
  vectorSize: 3872,
  distance: 'Cosine',
  timeout: 60000,
};

export const FILE_UPLOAD_CONFIG = {
  maxFileSize: 10 * 1024 * 1024,
  allowedExtensions: ['.txt', '.pdf', '.doc', '.docx', '.md', '.json', '.csv'],
  uploadDir: 'uploads',
};

export const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,  
  maxRequests: 100,
  strictMaxRequests: 20,
  authMaxRequests: 5,
};