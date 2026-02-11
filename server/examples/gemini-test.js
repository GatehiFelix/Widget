/**
 * Test script for Gemini LLM integration
 */

import { createLLMService } from '../core/llm/llmService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testGemini() {
  try {
    console.log('🚀 Testing Gemini LLM Service...\n');
    
    console.log('Environment check:');
    console.log('  LLM_PROVIDER:', process.env.LLM_PROVIDER);
    console.log('  GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '✅ Set (hidden)' : '❌ Not set');
    console.log('  GEMINI_MODEL:', process.env.GEMINI_MODEL);
    console.log('');
    
    // Create LLM service with Gemini
    console.log('Creating LLM service...');
    const llmService = createLLMService({ provider: 'gemini' });
    console.log('LLM service created successfully');
    
    // Get model info
    const modelInfo = llmService.getModelInfo();
    console.log('📊 Model Info:', modelInfo);
    console.log('');
    
    // Test basic generation
    console.log('💬 Testing basic generation...');
    const prompt = 'Explain what RAG (Retrieval Augmented Generation) is in one sentence.';
    const response = await llmService.generate(prompt);
    console.log('Response:', response);
    console.log('');
    
    // Test streaming
    console.log('🌊 Testing streaming...');
    const streamPrompt = 'List 3 benefits of using vector databases for RAG systems.';
    console.log('Streaming response: ');
    
    for await (const chunk of llmService.stream(streamPrompt)) {
      process.stdout.write(chunk);
    }
    console.log('\n\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testGemini();
