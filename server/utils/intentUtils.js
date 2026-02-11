// utils/intentUtils.js
// Utility for intent classification and question extraction using LLM
import createLLMService from '../core/llm/llmService.js';

const llmService = createLLMService();

/**
 * Classifies the intent of a user message.
 * Returns: { intent: 'greeting' | 'question' | 'greeting+question' | 'other', question: string|null }
 */
// utils/intentUtils.js
export const classifyIntent = (question) => {
    const greetings = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)/i;
    const greetingWithQuestion = /^(hi|hello|hey),?\s+(.+)/i;
    
    if (greetingWithQuestion.test(question)) {
        const match = question.match(greetingWithQuestion);
        return { 
            intent: 'greeting+question', 
            question: match[2].trim() 
        };
    }
    
    if (greetings.test(question)) {
        return { intent: 'greeting', question };
    }
    
    return { intent: 'question', question };
};
