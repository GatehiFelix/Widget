import { Ollama } from "@langchain/ollama";
import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "../../utils/logger.js";
import { config } from "../../config/index.js";

/**
 * Simple token counter (approximation: 1 token ≈ 4 characters)
 * For accurate counting, use tiktoken or provider-specific counters
 */
const estimateTokens = (text) => {
  return Math.ceil(text.length / 4);
};

/**
 * Creates an LLM service for language model operations
 * @param {Object} options - Configuration options
 * @returns {Object} LLM service with methods
 */
export const createLLMService = (options = {}) => {
  const provider = options.provider || process.env.LLM_PROVIDER || 'ollama';
  const temperature = options.temperature ?? parseFloat(process.env.TEMPERATURE || '0.7');
  
  let llm;
  let geminiModel; // For Gemini SDK
  let modelName;
  
  // Token usage tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  if (provider === 'gemini') {
    // Gemini Configuration using Google's official SDK
    modelName = options.modelName || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Gemini provider');
    }

    logger.info(`Initializing Gemini LLM service with model: ${modelName}`);
    logger.info(`Performance settings: temp=${temperature}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature,
        maxOutputTokens: options.maxOutputTokens || parseInt(process.env.MAX_OUTPUT_TOKENS || '2048'),
      }
    });
  } else {
    // Ollama Configuration (default)
    modelName = options.modelName || process.env.OLLAMA_MODEL || 'llama2';
    const baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const numPredict = options.numPredict ?? parseInt(process.env.OLLAMA_NUM_PREDICT || '256');
    const numCtx = options.numCtx ?? parseInt(process.env.OLLAMA_NUM_CTX || '2048');

    logger.info(`Initializing Ollama LLM service with model: ${modelName}`);
    logger.info(`Performance settings: numPredict=${numPredict}, numCtx=${numCtx}, temp=${temperature}`);

    llm = new Ollama({
      model: modelName,
      baseUrl,
      temperature,
      numPredict,  
      numCtx,      
    });
  }

  /**
   * Get the LLM instance
   * @returns {Ollama|Object} LLM instance
   */
  const getLLM = () => provider === 'gemini' ? geminiModel : llm;

  /**
   * Generate a response from the LLM
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<{text: string, usage: Object}>} Generated response with token usage
   */
  const generate = async (prompt, options = {}) => {
    try {
      const inputTokens = estimateTokens(prompt);
      logger.debug(`Generating response for prompt: ${prompt.substring(0, 100)}... (est. ${inputTokens} tokens)`);
      
      if (provider === 'gemini') {
        // Use Google's official SDK
        const result = await geminiModel.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // Get actual token counts from Gemini
        const usage = {
          inputTokens: response.usageMetadata?.promptTokenCount || inputTokens,
          outputTokens: response.usageMetadata?.candidatesTokenCount || estimateTokens(text),
          totalTokens: response.usageMetadata?.totalTokenCount || (inputTokens + estimateTokens(text))
        };
        
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        
        logger.debug(`Token usage: ${usage.inputTokens} input, ${usage.outputTokens} output`);
        
        return { text, usage };
      } else {
        // Use Ollama/LangChain
        const response = await llm.invoke(prompt, options);
        const text = typeof response === 'string' ? response : response.content || String(response);
        const outputTokens = estimateTokens(text);
        
        const usage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        };
        
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        
        logger.debug(`Token usage (estimated): ${usage.inputTokens} input, ${usage.outputTokens} output`);
        
        return { text, usage };
      }
    } catch (error) {
      logger.error(`LLM generation failed: ${error.message}`);
      throw error;
    }
  };

  /**
   * Stream a response from the LLM
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @returns {AsyncGenerator} Stream of response chunks
   */
  const stream = async function* (prompt, options = {}) {
    try {
      logger.debug(`Streaming response for prompt: ${prompt.substring(0, 100)}...`);
      
      if (provider === 'gemini') {
        // Use Google's official SDK streaming
        const result = await geminiModel.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            yield text;
          }
        }
      } else {
        // Use Ollama/LangChain streaming
        const streamResponse = await llm.stream(prompt, options);
        for await (const chunk of streamResponse) {
          if (typeof chunk === 'string') {
            yield chunk;
          } else if (chunk && chunk.content) {
            yield chunk.content;
          } else {
            yield chunk;
          }
        }
      }
    } catch (error) {
      logger.error(`LLM streaming failed: ${error.message}`);
      throw error;
    }
  };

  /**
   * Get model information
   * @returns {Object} Model configuration
   */
  const getModelInfo = () => ({
    provider,
    modelName,
    temperature,
  });
  
  /**
   * Get token usage statistics
   * @returns {Object} Token usage and cost estimate
   */
  const getTokenUsage = () => {
    const pricing = {
      'gemini-2.0-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 }, // per token
      'gemini-1.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
      'gemini-1.5-pro': { input: 1.25 / 1000000, output: 5.00 / 1000000 },
    };
    
    const modelPricing = pricing[modelName] || { input: 0, output: 0 };
    const estimatedCost = (totalInputTokens * modelPricing.input) + (totalOutputTokens * modelPricing.output);
    
    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCost: estimatedCost.toFixed(6),
      currency: 'USD'
    };
  };
  
  /**
   * Reset token usage counters
   */
  const resetTokenUsage = () => {
    totalInputTokens = 0;
    totalOutputTokens = 0;
  };

  return {
    getLLM,
    generate,
    stream,
    getModelInfo,
    getTokenUsage,
    resetTokenUsage,
  };
};

export default createLLMService;