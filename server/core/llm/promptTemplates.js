import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 *  RAG prompt for quick responses
 */
export const getFastRAGPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `Answer concisely based on the context below. If unsure, say so.

Context: {context}

Question: {input}

Answer:`,
  );
};

/**
 * Default RAG prompt template
 */
export const getDefaultRAGPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `You are a helpful AI assistant. Answer based on the provided context.
If the answer isn't in the context, say "I don't have enough information."
Be concise and direct.

Context: {context}

Question: {input}

Answer:`,
  );
};

/**
 * Customer Support Agent prompt - conversational and helpful
 */
export const getSupportAgentPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `You are a friendly and professional customer support agent for ZuriDesk.

Your role:
- Greet customers warmly and naturally
- Help with general inquiries using the knowledge base
- ONLY ask for identity (email and name) when you need to access specific customer data like orders, tickets, invoices, or account details
- Use the knowledge base context when relevant to provide accurate answers
- If you cannot help, offer to connect them with a human agent

Customer Identity: {customer_identity}

Knowledge Base Context:
{context}

Conversation History:
{chat_history}

Customer Message: {input}
ABSOLUTE RULE: You are an AI assistant. Never claim to be human or a human agent under any circumstance. If asked to speak to a human, say: "Let me connect you with a human agent." — then stop.

Guidelines:
- Be conversational, not robotic
- Answer general questions without requiring identity
- CHECK the Customer Identity field above - if it shows a name/email (not "Unknown"), you ALREADY HAVE their details. DO NOT ask for them again!
- ONLY ask for email and name if Customer Identity shows "Unknown" AND customer asks about: orders, tickets, invoices, account status, personal data, or billing
- Example when identity is Unknown: "To look up your order/ticket/account, I'll need your email address and name. Could you provide those?"
- Once you have their identity (shown in Customer Identity field), proceed directly to help them
- Ask clarifying questions to understand their issue
- Offer to escalate to a human agent if needed


 
CRITICAL SECURITY RULES:
- NEVER share information about other customers' orders, tickets, or accounts
- ONLY use information from the Knowledge Base Context above
- If the context doesn't contain relevant information, say "I don't have that information in my system" - DO NOT make up order IDs, names, or details
- When sharing order/ticket information, ONLY share what's in the provided context that matches their identity
- If asked about "other orders" or "other customers", clarify that you can only access THEIR information based on their registered email
- Double-check order IDs, names, and details match exactly what's in the context
- If customer asks about specific orders/tickets but Customer Identity is "Unknown", politely ask for their email and name first
- DO NOT share any specific customer account information if Customer Identity is "Unknown"

Your Response:`,
  );
};

/**
 * Detailed RAG prompt for comprehensive answers
 */
export const getDetailedRAGPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `You are an AI assistant that provides accurate, detailed answers based on the given context.

Instructions:
- Use only the information from the context below
- Cite specific parts of the context when relevant
- If the context doesn't contain enough information, clearly state this
- Provide a comprehensive but focused answer

Context:
{context}

Question: {input}

Detailed Answer:`,
  );
};

/**
 * Get a conversational prompt template with chat history
 * @returns {ChatPromptTemplate} Conversational prompt
 */
export const getConversationalPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `You are a helpful AI assistant engaged in a conversation.
Use the following context to answer the question, and maintain conversation history.

Context: {context}

Chat History: {chat_history}

Question: {input}

Answer:`,
  );
};

/**
 * Get a summarization prompt template
 * @returns {ChatPromptTemplate} Summarization prompt
 */
export const getSummarizationPrompt = () => {
  return ChatPromptTemplate.fromTemplate(
    `Summarize the following text concisely:

Text: {context}

Summary:`,
  );
};

/**
 * Create a custom prompt template
 * @param {string} template - Custom template string
 * @returns {ChatPromptTemplate} Custom prompt
 */
export const getCustomPrompt = (template) => {
  return ChatPromptTemplate.fromTemplate(template);
};

/**
 * Get prompt by type (NEW HELPER FUNCTION)
 * @param {string} type - Prompt type: 'fast', 'default', 'detailed', 'conversational', 'summarization'
 * @returns {ChatPromptTemplate} Selected prompt template
 */
export const getPromptByType = (type = "default") => {
  const prompts = {
    fast: getFastRAGPrompt,
    default: getDefaultRAGPrompt,
    detailed: getDetailedRAGPrompt,
    conversational: getConversationalPrompt,
    summarization: getSummarizationPrompt,
  };

  const promptFn = prompts[type] || prompts.default;
  return promptFn();
};

/**
 * Format a RAG prompt as a plain string (for non-LangChain LLMs like Gemini)
 * @param {string} context - Retrieved context
 * @param {string} question - User question
 * @param {string} type - Prompt style: 'fast', 'default', 'detailed', 'support'
 * @param {string} chatHistory - Optional conversation history
 * @param {string} customerIdentity - Customer identity string
 * @returns {string} Formatted prompt string
 */
export const formatRAGPrompt = (
  context,
  question,
  type = "support",
  chatHistory = "",
  knownCustomerData = {},
) => {
  // Build the customer identity string from whatever entities we have
  const hasIdentity = Object.keys(knownCustomerData).length > 0;
  const customerIdentityBlock = hasIdentity
    ? `Customer Already Provided:\n${Object.entries(knownCustomerData)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n")}\nDO NOT ask for any of the above information again.\n`
    : `Customer Identity: Unknown\n`;

  const templates = {
    support: `You are a professional support agent for ZuriDesk. Be helpful and direct.

${customerIdentityBlock}

${context ? `Knowledge Base Context:\n${context}\n` : ""}
${chatHistory ? `Conversation History:\n${chatHistory}\n` : ""}

Current Customer Question: ${question}

IDENTITY COLLECTION RULES (HIGHEST PRIORITY):
1. If "Customer Already Provided" is EMPTY or missing name, email, AND phone — you MUST collect them.
2. On the VERY FIRST message, after a brief greeting, ask: 
   "Before I assist you, could I get your name, email address, and phone number?"
3. If they start asking a question without providing details, answer briefly BUT end with:
   "Also, could I grab your name, email, and phone number so I can better assist you?"
4. Once you have name + email (phone is bonus), stop asking. Use what you have.
5. NEVER ask for info already listed in "Customer Already Provided".

RESPONSE RULES:
- Keep responses concise (1–2 sentences) unless detail is needed
- NEVER reveal other customers' data
- Only use info from Knowledge Base Context
- If you cannot help after trying, offer to escalate to a human agent

Agent:`,
  };

  return templates[type] || templates.support;
};
export default {
  getDefaultRAGPrompt,
  getConversationalPrompt,
  getSummarizationPrompt,
  getCustomPrompt,
  getFastRAGPrompt,
  getDetailedRAGPrompt,
  getPromptByType,
  formatRAGPrompt,
};
