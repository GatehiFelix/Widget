import createLLMService from '../core/llm/llmService.js';
import createQueryService from '../services/queryService.js';

// LLM service uses environment variables for configuration
// LLM_PROVIDER=gemini uses GEMINI_MODEL
// LLM_PROVIDER=ollama uses OLLAMA_MODEL
const llmService = createLLMService({
  temperature: 0.7,
});
const queryServicePromise = createQueryService();

export const llmRagQueryController = async (req, res) => {
  const { tenant_id, question } = req.body;
  if (!tenant_id || !question) {
    return res.status(400).json({ success: false, error: 'tenant_id and question are required.' });
  }

  try {
    const queryService = await queryServicePromise;
    // Retrieve top 3 chunks for speed
    const contextChunks = await queryService.semanticSearch(tenant_id, question, 3);

    let contextText = contextChunks && contextChunks.length
      ? contextChunks.map(chunk => chunk.pageContent).join('\n\n')
      : '';

    // Truncate context to 1000 characters for debugging
    const maxContextLength = 1000;
    if (contextText.length > maxContextLength) {
      contextText = contextText.slice(0, maxContextLength);
      console.log(`[RAG] Context truncated to ${maxContextLength} chars.`);
    }

    // Log context and prompt size
    const contextLength = contextText.length;
    const numChunks = contextChunks ? contextChunks.length : 0;
    console.log(`[RAG] Context length: ${contextLength} chars, Chunks: ${numChunks}`);

    // If no context, optionally return a fallback or still use LLM
    let prompt;
    if (contextText) {
      prompt = `You are a helpful assistant. Use the following context to answer the user's question.\n\nContext:\n${contextText}\n\nQuestion: ${question}\nAnswer:`;
    } else {
      prompt = `A user asked: \"${question}\". Answer as helpfully as possible.`;
    }

    console.log(`[RAG] Prompt length: ${prompt.length} chars`);
    console.log(`[RAG] Prompt sent to Ollama:\n${prompt}`);
    const start = Date.now();
    // Generate answer with LLM
    const llmAnswer = await llmService.generate(prompt);
    const end = Date.now();
    console.log(`[RAG] LLM generation time: ${(end - start) / 1000}s`);

    res.json({
      success: true,
      answer: llmAnswer,
      sources: contextChunks,
      metadata: {
        tenant_id,
        question,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};