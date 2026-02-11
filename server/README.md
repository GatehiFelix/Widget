# RAG Server

Production-ready RAG (Retrieval-Augmented Generation) system with Qdrant vector database and multi-tenancy support.

## Features

- 🚀 **Functional Programming** - Clean, composable functions instead of classes
- 🏢 **Multi-tenancy** - Isolated data per tenant
- 📚 **Document Processing** - PDF, TXT support with chunking
- 🔍 **Semantic Search** - Vector similarity search
- 💬 **RAG Queries** - Context-aware question answering
- 🌊 **Streaming** - Stream responses in real-time
- 🔧 **Configurable** - Environment-based configuration

## Prerequisites

- Node.js >= 18.0.0
- Qdrant (vector database)
- Ollama (local LLM)

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Setup Qdrant (Vector Database)

```bash
# Using Docker
docker run -d -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage:z \
  qdrant/qdrant
```

### 3. Setup Ollama (Local LLM)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull gemma2:2b
ollama pull nomic-embed-text:latest
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

## Usage

### Basic Example

```javascript
import { createRAGApplication } from './index.js';

// Initialize the application
const app = await createRAGApplication({
  collectionName: 'my_documents',
  chunkSize: 1000,
  chunkOverlap: 100,
});

// Index a document
await app.indexDocument(
  './data/documents/sample.pdf',
  'tenant_id',
  { category: 'documentation' }
);

// Query the system
const result = await app.query(
  'tenant_id',
  'What are the main features?'
);

console.log(result.answer);
```

### Run Examples

```bash
# Basic usage
node examples/basic-usage.js

# Streaming responses
node examples/streaming-example.js

# Multi-tenant demo
node examples/multi-tenant-example.js

# Semantic search
node examples/semantic-search-example.js
```

## API

### Indexing

```javascript
// Index single document
await app.indexDocument(filePath, tenantId, metadata);

// Index multiple documents
await app.indexMultipleDocuments(filePaths, tenantId, metadata);

// Delete documents
await app.deleteDocuments(tenantId, documentId);
```

### Querying

```javascript
// Standard query
const result = await app.query(tenantId, question, options);

// Streaming query
const stream = await app.streamQuery(tenantId, question, options);

// Semantic search
const results = await app.semanticSearch(tenantId, query, limit);
```

### Tenant Management

```javascript
// Get tenant stats
const stats = await app.getTenantStats(tenantId);

// List all tenants
const tenants = await app.listTenants();

// Delete tenant
await app.deleteTenant(tenantId);
```

## Project Structure

```
server/
├── config/              # Configuration
│   ├── index.js        # Main config
│   └── constants.js    # Constants
├── core/               # Core functionality
│   ├── embeddings/     # Embedding service
│   ├── llm/            # LLM service
│   ├── vectorstore/    # Qdrant service
│   └── rag/            # RAG pipeline
├── services/           # Business logic
│   ├── documentService.js
│   ├── indexingService.js
│   ├── queryService.js
│   └── tenantService.js
├── utils/              # Utilities
│   ├── logger.js
│   ├── validators.js
│   ├── errors.js
│   └── helpers.js
├── examples/           # Usage examples
└── index.js           # Main entry point
```

## Configuration

Environment variables (`.env`):

```env
# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=documents

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=gemma2:2b
EMBEDDING_MODEL=nomic-embed-text:latest

# RAG Settings
CHUNK_SIZE=1000
CHUNK_OVERLAP=100
K_DOCUMENTS=3
TEMPERATURE=0

# Application
PORT=3000
LOG_LEVEL=info
```

## License

MIT
