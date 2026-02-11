/**
 * Handover Detection Service
 * 
 * Intelligently detects when a conversation should be escalated to a human agent
 * based on multiple signals:
 * - Explicit user requests
 * - Repetitive questions
 * - Back-and-forth without resolution
 * - Negative sentiment
 * - Complex queries requiring human intervention
 */

import logger from '../utils/logger.js';

// Phrases that indicate user wants to speak to an agent
const AGENT_REQUEST_PATTERNS = [
    /speak (to|with) (an? )?(agent|human|person|support|someone|representative)/i,
    /talk (to|with) (an? )?(agent|human|person|support|someone|representative)/i,
    /connect (me )?(to|with) (an? )?(agent|human|person|support|someone)/i,
    /transfer (me )?(to|with) (an? )?(agent|human|person|support|someone)/i,
    /i (want|need|would like) (to )?(speak|talk) (to|with) (an? )?(agent|human|person)/i,
    /get (me )?(an? )?(agent|human|support|representative)/i,
    /call (me|back)/i,
    /human (support|help|assistance)/i,
    /live (agent|support|chat|person)/i,
    /real person/i,
    /customer (service|support)/i,
    /can i (speak|talk) (to|with)/i,
];

// Phrases indicating frustration or negative sentiment
const FRUSTRATION_PATTERNS = [
    /(not|doesn't|isn't|don't) (help|helping|work|working|useful)/i,
    /(frustrated|annoyed|angry|upset)/i,
    /this (is|isn't) (not )?what i (asked|needed|wanted)/i,
    /(terrible|awful|horrible|useless) (service|support|help)/i,
    /waste (of )?time/i,
    /give up/i,
    /forget it/i,
    /never mind/i,
    /(stupid|dumb) (bot|ai|system)/i,
    /not understanding/i,
    /same (thing|answer|response) (again|over)/i,
    /told you (already|before)/i,
];

// Phrases indicating complex situations requiring agent
const COMPLEX_QUERY_PATTERNS = [
    /billing (issue|problem|dispute)/i,
    /refund/i,
    /account (access|locked|suspended|disabled)/i,
    /payment (failed|declined|problem)/i,
    /urgent/i,
    /emergency/i,
    /complaint/i,
    /legal/i,
    /lawyer/i,
    /sue/i,
    /escalate/i,
    /manager/i,
    /supervisor/i,
];

// Similarity threshold for detecting repeated questions
const SIMILARITY_THRESHOLD = 0.7;

// Conversation quality thresholds
const THRESHOLDS = {
    MAX_BACK_AND_FORTH: 4,        // Escalate after 4 back-and-forth exchanges
    MAX_SIMILAR_QUESTIONS: 2,      // Escalate if user asks similar question 2+ times
    LOW_CONFIDENCE_SCORE: 0.4,     // Escalate if AI confidence is below this
    SENTIMENT_WINDOW: 3,           // Check sentiment over last 3 messages
};

/**
 * Check if user explicitly requested an agent
 */
const detectExplicitAgentRequest = (message) => {
    const normalizedMessage = message.toLowerCase().trim();
    
    for (const pattern of AGENT_REQUEST_PATTERNS) {
        if (pattern.test(normalizedMessage)) {
            logger.info(`Explicit agent request detected: "${message}"`);
            return {
                shouldHandover: true,
                reason: 'explicit_request',
                confidence: 1.0,
                message: 'User explicitly requested to speak with an agent'
            };
        }
    }
    
    return null;
};

/**
 * Detect frustration or negative sentiment
 */
const detectFrustration = (message) => {
    const normalizedMessage = message.toLowerCase().trim();
    
    for (const pattern of FRUSTRATION_PATTERNS) {
        if (pattern.test(normalizedMessage)) {
            logger.info(`Frustration detected: "${message}"`);
            return {
                shouldHandover: true,
                reason: 'user_frustration',
                confidence: 0.9,
                message: 'User appears frustrated or dissatisfied with AI assistance'
            };
        }
    }
    
    return null;
};

/**
 * Detect complex queries that require human intervention
 */
const detectComplexQuery = (message) => {
    const normalizedMessage = message.toLowerCase().trim();
    
    for (const pattern of COMPLEX_QUERY_PATTERNS) {
        if (pattern.test(normalizedMessage)) {
            logger.info(`Complex query detected: "${message}"`);
            return {
                shouldHandover: true,
                reason: 'complex_query',
                confidence: 0.85,
                message: 'Query requires specialized agent assistance'
            };
        }
    }
    
    return null;
};

/**
 * Simple text similarity using Jaccard index
 */
const calculateSimilarity = (text1, text2) => {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
};

/**
 * Detect if user is asking repetitive/similar questions
 */
const detectRepetitiveQuestions = (conversationHistory) => {
    if (!conversationHistory || conversationHistory.length < 4) {
        return null;
    }
    
    // Get user messages only
    const userMessages = conversationHistory
        .filter(msg => msg.sender_type === 'customer')
        .map(msg => msg.content);
    
    if (userMessages.length < 2) {
        return null;
    }
    
    // Check last message against previous ones
    const lastMessage = userMessages[userMessages.length - 1];
    let similarCount = 0;
    
    for (let i = userMessages.length - 2; i >= Math.max(0, userMessages.length - 5); i--) {
        const similarity = calculateSimilarity(lastMessage, userMessages[i]);
        if (similarity >= SIMILARITY_THRESHOLD) {
            similarCount++;
        }
    }
    
    if (similarCount >= THRESHOLDS.MAX_SIMILAR_QUESTIONS - 1) {
        logger.info(`Repetitive questions detected (${similarCount + 1} similar questions)`);
        return {
            shouldHandover: true,
            reason: 'repetitive_questions',
            confidence: 0.8,
            message: 'User is asking similar questions repeatedly - may need human assistance'
        };
    }
    
    return null;
};

/**
 * Detect excessive back-and-forth without resolution
 */
const detectBackAndForth = (conversationHistory) => {
    if (!conversationHistory || conversationHistory.length < THRESHOLDS.MAX_BACK_AND_FORTH * 2) {
        return null;
    }
    
    const recentMessages = conversationHistory.slice(-THRESHOLDS.MAX_BACK_AND_FORTH * 2);
    
    // Count customer-AI exchanges in recent messages
    const exchanges = Math.floor(recentMessages.length / 2);
    
    if (exchanges >= THRESHOLDS.MAX_BACK_AND_FORTH) {
        // Check if conversation seems to be going in circles
        // If there are many short responses or questions, it's likely unresolved
        const shortResponses = recentMessages.filter(msg => 
            msg.content.length < 100 && msg.sender_type === 'ai'
        ).length;
        
        if (shortResponses >= 2) {
            logger.info(`Excessive back-and-forth detected (${exchanges} exchanges)`);
            return {
                shouldHandover: true,
                reason: 'excessive_back_and_forth',
                confidence: 0.75,
                message: 'Conversation has multiple exchanges without clear resolution'
            };
        }
    }
    
    return null;
};

/**
 * Check if AI confidence is consistently low
 */
const detectLowConfidence = (recentAiResponses) => {
    if (!recentAiResponses || recentAiResponses.length === 0) {
        return null;
    }
    
    // Check last AI response confidence if available
    const lastResponse = recentAiResponses[recentAiResponses.length - 1];
    
    if (lastResponse.metadata?.confidence && 
        lastResponse.metadata.confidence < THRESHOLDS.LOW_CONFIDENCE_SCORE) {
        logger.info(`Low AI confidence detected: ${lastResponse.metadata.confidence}`);
        return {
            shouldHandover: true,
            reason: 'low_ai_confidence',
            confidence: 0.7,
            message: 'AI confidence is low - human agent may provide better assistance'
        };
    }
    
    return null;
};

/**
 * Main handover detection function
 * Analyzes the current message and conversation history to determine if handover is needed
 * 
 * @param {string} currentMessage - The latest user message
 * @param {Array} conversationHistory - Array of previous messages with sender_type and content
 * @param {Object} options - Additional options (confidence scores, context)
 * @returns {Object|null} Handover recommendation or null if no handover needed
 */
export const analyzeHandoverNeed = (currentMessage, conversationHistory = [], options = {}) => {
    logger.debug('Analyzing handover need...');
    
    // Priority 1: Explicit agent request (immediate handover)
    const explicitRequest = detectExplicitAgentRequest(currentMessage);
    if (explicitRequest) {
        return explicitRequest;
    }
    
    // Priority 2: Complex query requiring specialized help
    const complexQuery = detectComplexQuery(currentMessage);
    if (complexQuery) {
        return complexQuery;
    }
    
    // Priority 3: User frustration
    const frustration = detectFrustration(currentMessage);
    if (frustration) {
        return frustration;
    }
    
    // Priority 4: Repetitive questions
    const repetitive = detectRepetitiveQuestions(conversationHistory);
    if (repetitive) {
        return repetitive;
    }
    
    // Priority 5: Excessive back-and-forth
    const backAndForth = detectBackAndForth(conversationHistory);
    if (backAndForth) {
        return backAndForth;
    }
    
    // Priority 6: Low AI confidence
    if (options.aiResponses) {
        const lowConfidence = detectLowConfidence(options.aiResponses);
        if (lowConfidence) {
            return lowConfidence;
        }
    }
    
    // No handover needed
    return null;
};

/**
 * Get handover statistics for monitoring
 */
export const getHandoverStats = () => {
    return {
        thresholds: THRESHOLDS,
        patterns: {
            agentRequests: AGENT_REQUEST_PATTERNS.length,
            frustration: FRUSTRATION_PATTERNS.length,
            complexQueries: COMPLEX_QUERY_PATTERNS.length
        }
    };
};

export default {
    analyzeHandoverNeed,
    getHandoverStats
};
