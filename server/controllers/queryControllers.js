
import asyncHandler from "../middleware/asyncHandler.js";
import logger from "../utils/logger.js";
import { PerformanceTracker } from "../utils/performanceTracker.js";
import { getState, setState, clearState } from '../utils/conversationState.js';
import createQueryService from '../services/queryService.js';
import createLLMService from '../core/llm/llmService.js';
import { classifyIntent } from '../utils/intentUtils.js';

const queryServicePromise = createQueryService();
const llmService = createLLMService();




export const chatController = async (req, res) => {
    const { tenant_id, question, user_id } = req.body;
    
    // Classify intent
    const { intent, question: extractedQuestion } = classifyIntent(question);
    const finalQuestion = extractedQuestion || question;

    try {
        // Initialize services
        const queryService = await queryServicePromise;
        
        // For greetings or chitchat, check if there's additional context in the question
        const hasAdditionalContext = finalQuestion.toLowerCase() !== question.toLowerCase() || 
                                    (intent === 'greeting' && question.split(' ').length > 3);

        // If it's ONLY a greeting (e.g., "hello", "hi"), respond warmly
        if (intent === 'greeting' && !hasAdditionalContext) {
            return res.json({
                success: true,
                reply: "Hello! How can I help you today?",
                sources: []
            });
        }

        // Try to retrieve context from knowledge base
        const results = await queryService.hybridRetrieve(tenant_id, finalQuestion, {
            limit: 3,
            scoreThreshold: 0.5  
        });

        const contextStr = results.results.map(r => r.text).join('\n\n');
        
        // Build a concise, context-aware prompt
        let prompt;
        if (contextStr && contextStr.trim().length > 0) {
            // We have knowledge base context - answer directly
            prompt = `Context: ${contextStr}

Question: ${question}

Instructions: Answer the question directly using the context. Be brief (1-3 sentences). Acknowledge greetings naturally if present. Only ask for additional info if the context doesn't contain the answer.

Answer:`;
        } else {
            // No relevant context - be helpful but brief
            prompt = `Question: ${question}

Instructions: The user needs help but we don't have specific info in our knowledge base. Respond briefly (1-2 sentences): acknowledge their greeting/issue and ask ONLY for the most essential detail needed (e.g., "Can you share your email?" or "What's your order ID?"). Don't over-explain.

Answer:`;
        }

        // Generate response using LLM
        const result = await llmService.generate(prompt);
        const reply = result.text || result; // Handle both old and new format
        const usage = result.usage || null;

        // Log token usage for cost tracking
        if (usage) {
            logger.info(`Token usage - Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Total: ${usage.totalTokens}`);
        }

        // Format sources
        const sources = results.results.slice(0, 3).map(r => ({
            content: r.text?.substring(0, 200) || '',
            metadata: r.metadata || {}
        }));

        return res.json({
            success: true,
            reply: reply.trim(),
            sources: sources.length > 0 ? sources : [],
            metadata: usage ? {
                tokenUsage: usage,
                estimatedCost: ((usage.inputTokens * 0.075 / 1000000) + (usage.outputTokens * 0.30 / 1000000)).toFixed(6) + ' USD'
            } : undefined
        });
        
    } catch (error) {
        logger.error(`Error in chat controller: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * @desc Query RAG system
 * @route POST /api/query
 * @access Public
 */
export const queryController = asyncHandler(async (req, res) => {
    const { tenant_id, question, options = {} } = req.body;
    const tracker = new PerformanceTracker('RAG Query');

    logger.info(`Query from tenant ${tenant_id}: ${question}`);

    try {
        tracker.mark('Query Started');
        
        const result = await req.ragApp.query(tenant_id, question, options);
        
        tracker.mark('Query Completed');
        const perf = tracker.getData();

        res.status(200).json({
            success: true,
            data: {
                answer: result.answer,
                sources: result.context?.map(doc => ({
                    content: doc.pageContent.substring(0, 200),
                    metadata: doc.metadata
                })),
                metadata: {
                    tenant_id,
                    question,
                    timestamp: new Date().toISOString(),
                    performance: perf
                } 
            }
        });
    } catch (error) {
        logger.error(`Error processing query for tenant ${tenant_id}: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @desc stream query RAG system
 * @route POST /api/query/stream
 * @access Public
 */
export const streamQueryController = asyncHandler(async (req, res) => {
    const { tenant_id, question, options = {} } = req.body;
    const tracker = new PerformanceTracker('RAG Stream Query');

    logger.info(`Stream Query from tenant ${tenant_id}: ${question}`);

    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');

    try {
        tracker.mark('Stream Started');
        const stream = await req.ragApp.streamQuery(tenant_id, question, options);

        for await (const chunk of stream) {
            if(chunk.answer) {
                res.write(`data: ${JSON.stringify({ 
                    type: 'token',
                    content: chunk.answer
                })}\n\n`);
            }
        }

        tracker.mark('Stream Completed');
        const perf = tracker.getData();

        res.write(`data: ${JSON.stringify({ 
            type: 'done',
            performance: perf
        })}\n\n`);
        res.end();
    } catch (error) {
        logger.error(`Error processing stream query for tenant ${tenant_id}: ${error.message}`);
        res.write(`data: ${JSON.stringify({ 
            type: 'error',
            message: error.message
         })}\n\n`);
         res.end();
    }
});

/**
 * @desc Semantic search (no llm)
 * @route POST /api/query/semantic-search
 * @access Public
 */
export const semanticSearchController = asyncHandler(async (req, res) => {
    const { tenant_id, query, limit = 5 } = req.body;
    
    logger.info(`Semantic search from tenant ${tenant_id}: ${query}`);

    try {
        const results = await req.ragApp.semanticSearch(tenant_id, query, limit);
        
        res.status(200).json({
            success: true,
            data: {
                results: results.map(([doc, score]) => ({
                    content: doc.pageContent,
                    metadata: doc.metadata,
                    score
                })),
                metadata: {
                    tenant_id,
                    query,
                    limit,
                    count: results.length,
                    timestamp: new Date().toISOString()
                }
            }
        });
    } catch (error) {
        logger.error(`Error in semantic search for tenant ${tenant_id}: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


export const hybridQueryController = asyncHandler(async (req,res) => {
    const { tenant_id ,query} = req.body
    console.log("Hybrid query received:", tenant_id, query);
    if(!tenant_id || !query){
        return res.status(400).json({success:false, error:"tenant_id and query are required"})
    }

    const queryService = await queryServicePromise
    const result = await queryService.hybridRetrieve(tenant_id, query)
    res.json({success:true, ...result});
})

/**
 * @desc Get token usage statistics
 * @route GET /api/query/token-usage
 * @access Public
 */
export const getTokenUsageController = asyncHandler(async (req, res) => {
    const usage = llmService.getTokenUsage();
    
    res.status(200).json({
        success: true,
        data: usage
    });
});

