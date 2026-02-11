// ============================================================
// Semantic Search Example - Functional Approach
// ============================================================

import { createRAGApplication } from '../index.js';

const semanticSearchExample = async () => {
  console.log('🔍 RAG System - Semantic Search Example\n');
  console.log('='.repeat(60));

  const app = await createRAGApplication();

  const tenantId = 'company_a';
  const queries = [
    'file configuration',
    'keyboard shortcuts',
    'debugging features',
  ];

  for (const query of queries) {
    console.log(`\n🔎 Searching for: "${query}"\n`);
    
    const results = await app.semanticSearch(tenantId, query, 3);
    
    results.forEach(([doc, score], i) => {
      console.log(`${i + 1}. Score: ${score.toFixed(4)}`);
      console.log(`   ${doc.pageContent.substring(0, 150)}...`);
      console.log(`   Source: ${doc.metadata.source}`);
      console.log();
    });
  }

  console.log('='.repeat(60));
};

// Run the example
semanticSearchExample().catch(console.error);
