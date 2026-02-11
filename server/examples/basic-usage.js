import { createRAGApplication } from '../index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const basicExample = async () => {
  console.log('📚 RAG System - Basic Usage Example\n');
  console.log('='.repeat(60));

  // 1. Initialize the application
  const app = await createRAGApplication({
    collectionName: 'my_documents',
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  // 2. Index a document
  const pdfPath = path.join(__dirname, '../data/documents/sample.pdf');
  const tenantId = 'company_a';

  console.log('\n📄 Indexing document...');
  const indexResult = await app.indexDocument(pdfPath, tenantId, {
    category: 'documentation',
    version: '2024',
  });
  console.log('✅ Indexing complete:', indexResult);

  // 3. Query the system
  console.log('\n💬 Querying the system...\n');
  const result = await app.query(
    tenantId,
    'What are the main features?'
  );
  console.log('🤖 Answer:', result.answer);

  // 4. Get tenant stats
  console.log('\n📊 Tenant stats:');
  const stats = await app.getTenantStats(tenantId);
  console.log(stats);

  console.log('\n' + '='.repeat(60));
};

// Run the example
basicExample().catch(console.error);
