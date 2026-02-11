// ============================================================
// Streaming Example - Functional Approach
// ============================================================

import { createRAGApplication } from '../index.js';

const streamingExample = async () => {
  console.log('🌊 RAG System - Streaming Example\n');
  console.log('='.repeat(60));

  const app = await createRAGApplication();

  const tenantId = 'company_a';
  const question = 'Explain the main features in detail';

  console.log(`\n💬 Question: "${question}"\n`);
  console.log('🤖 Streaming Answer:\n');

  const stream = await app.streamQuery(tenantId, question);

  let fullAnswer = '';
  for await (const chunk of stream) {
    if (chunk.answer) {
      process.stdout.write(chunk.answer);
      fullAnswer += chunk.answer;
    }
  }

  console.log('\n\n✅ Streaming complete');
  console.log(`📏 Total length: ${fullAnswer.length} characters`);
  console.log('='.repeat(60));
};

// Run the example
streamingExample().catch(console.error);
