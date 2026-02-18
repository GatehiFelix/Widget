/**
 * Handover Detection Service
 *
 * Two-tier escalation:
 * - IMMEDIATE: explicit requests, legal threats, emergencies → hand over right away
 * - ASSISTED: complex/technical issues → AI collects identity first, then hands over
 */

import logger from "../utils/logger.js";

// Always hand over immediately — no info gathering needed
const IMMEDIATE_HANDOVER_PATTERNS = [
  /speak (to|with) (an? )?(real |actual |live )?(agent|human|person|support|someone|representative)/i,
  /talk (to|with) (an? )?(real |actual |live )?(agent|human|person|support|someone|representative)/i,
  /get (me )?(an? )?(real |actual |live )?(agent|human|person|support|someone|representative)/i,
  /connect (me )?(to|with) (an? )?(agent|human|person|support|someone)/i,
  /transfer (me )?(to|with) (an? )?(agent|human|person|support|someone)/i,
  /i (want|need|would like) (to )?(speak|talk) (to|with) (an? )?(agent|human|person)/i,
  /human (support|help|assistance)/i,
  /live (agent|support|chat|person)/i,
  /real person/i,
  /can i (speak|talk) (to|with)/i,
  /manager|supervisor/i,
  /legal|lawyer|sue/i,
  /emergency/i,
  /real (agent|human|person)/i,
  /actual (agent|human|person)/i,
  /noo+.*agent/i,
  /like (a |an )?(human|real|actual|live) (agent|person|support)/i,
];

// Hand over only after AI collects customer identity (email + name)
const ASSISTED_HANDOVER_PATTERNS = [
  /billing (issue|problem|dispute)/i,
  /refund/i,
  /account (access|locked|suspended|disabled)/i,
  /payment (failed|declined|problem|issue)/i,
  /complaint/i,
  /escalate/i,
  /login (issue|problem|error|fail|failing)/i,
  /can'?t (login|log in|access|sign in)/i,
  /password (reset|forgot|expired|not working)/i,
  /technical (issue|problem|error)/i,
  /not (working|loading|connecting)/i,
  /keeps? (crashing|failing|timing out)/i,
  /data (missing|lost|wrong|incorrect)/i,
  /charged (twice|incorrectly|wrong amount)/i,
  /subscription (cancel|cancelled|expired|issue)/i,
];

// Frustration signals — assisted handover (collect info, then escalate)
const FRUSTRATION_PATTERNS = [
  /(not|doesn't|isn't|don't) (help|helping|work|working|useful)/i,
  /(frustrated|annoyed|angry|upset)/i,
  /this (is|isn't) (not )?what i (asked|needed|wanted)/i,
  /(terrible|awful|horrible|useless) (service|support|help)/i,
  /waste (of )?time/i,
  /give up/i,
  /forget it/i,
  /(stupid|dumb) (bot|ai|system)/i,
  /not understanding/i,
  /same (thing|answer|response) (again|over)/i,
  /told you (already|before)/i,
];

const SIMILARITY_THRESHOLD = 0.7;

const THRESHOLDS = {
  MAX_BACK_AND_FORTH: 6, // Increased from 4 — give AI more room to resolve
  MAX_SIMILAR_QUESTIONS: 3, // Increased from 2 — avoid premature escalation
  LOW_CONFIDENCE_SCORE: 0.35, // Slightly lower — only escalate on very low confidence
  MIN_CONVERSATION_LENGTH: 4, // Don't escalate on very short conversations
};

/**
 * Check identity readiness — has the AI already collected what an agent needs?
 */
const hasCustomerIdentity = (collectedEntities = {}) => {
  return !!(
    collectedEntities.email ||
    collectedEntities.name ||
    collectedEntities.phone
  );
};

/**
 * Immediate handover patterns — explicit requests, legal, emergencies
 */
const detectImmediateHandover = (message) => {
  const normalized = message.toLowerCase().trim();

  for (const pattern of IMMEDIATE_HANDOVER_PATTERNS) {
    if (pattern.test(normalized)) {
      logger.info(`Immediate handover triggered: "${message}"`);
      return {
        shouldHandover: true,
        immediate: true,
        reason: "explicit_request",
        confidence: 1.0,
        message: "User explicitly requested an agent",
      };
    }
  }
  return null;
};

/**
 * Assisted handover — complex issues that need identity collected first
 */
const detectAssistedHandover = (message) => {
  const normalized = message.toLowerCase().trim();

  for (const pattern of ASSISTED_HANDOVER_PATTERNS) {
    if (pattern.test(normalized)) {
      logger.info(`Assisted handover triggered: "${message}"`);
      return {
        shouldHandover: true,
        immediate: false,
        reason: "complex_query",
        confidence: 0.85,
        message:
          "Complex issue detected — collecting customer identity before escalating",
      };
    }
  }
  return null;
};

/**
 * Frustration detection — give AI one more chance if identity not yet collected
 */
const detectFrustration = (message) => {
  const normalized = message.toLowerCase().trim();

  for (const pattern of FRUSTRATION_PATTERNS) {
    if (pattern.test(normalized)) {
      logger.info(`Frustration detected: "${message}"`);
      return {
        shouldHandover: true,
        immediate: false, // still collect identity if missing
        reason: "user_frustration",
        confidence: 0.9,
        message: "User appears frustrated — escalating after identity check",
      };
    }
  }
  return null;
};

/**
 * Jaccard similarity for repetition detection
 */
const calculateSimilarity = (text1, text2) => {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
};

/**
 * Detect repetitive questions
 */
const detectRepetitiveQuestions = (conversationHistory) => {
  if (
    !conversationHistory ||
    conversationHistory.length < THRESHOLDS.MIN_CONVERSATION_LENGTH
  ) {
    return null;
  }

  const userMessages = conversationHistory
    .filter((msg) => msg.sender_type === "customer")
    .map((msg) => msg.content);

  if (userMessages.length < 3) return null;

  const lastMessage = userMessages[userMessages.length - 1];
  let similarCount = 0;

  for (
    let i = userMessages.length - 2;
    i >= Math.max(0, userMessages.length - 5);
    i--
  ) {
    if (
      calculateSimilarity(lastMessage, userMessages[i]) >= SIMILARITY_THRESHOLD
    ) {
      similarCount++;
    }
  }

  if (similarCount >= THRESHOLDS.MAX_SIMILAR_QUESTIONS - 1) {
    logger.info(`Repetitive questions detected (${similarCount + 1} similar)`);
    return {
      shouldHandover: true,
      immediate: false,
      reason: "repetitive_questions",
      confidence: 0.8,
      message: "User repeating questions — may need human assistance",
    };
  }

  return null;
};

/**
 * Detect prolonged unresolved conversation
 */
const detectBackAndForth = (conversationHistory) => {
  if (
    !conversationHistory ||
    conversationHistory.length < THRESHOLDS.MAX_BACK_AND_FORTH * 2
  ) {
    return null;
  }

  const recentMessages = conversationHistory.slice(
    -THRESHOLDS.MAX_BACK_AND_FORTH * 2,
  );
  const exchanges = Math.floor(recentMessages.length / 2);

  if (exchanges >= THRESHOLDS.MAX_BACK_AND_FORTH) {
    // Only trigger if AI responses are short — suggests it's stuck
    const shortAiResponses = recentMessages.filter(
      (msg) => msg.sender_type === "ai" && msg.content.length < 120,
    ).length;

    if (shortAiResponses >= 3) {
      logger.info(`Prolonged unresolved conversation (${exchanges} exchanges)`);
      return {
        shouldHandover: true,
        immediate: false,
        reason: "excessive_back_and_forth",
        confidence: 0.75,
        message: "Conversation unresolved after multiple exchanges",
      };
    }
  }

  return null;
};

/**
 * Detect consistently low AI confidence
 */
const detectLowConfidence = (recentAiResponses) => {
  if (!recentAiResponses || recentAiResponses.length < 2) return null;

  // Require 2 consecutive low-confidence responses before escalating
  const recentTwo = recentAiResponses.slice(-2);
  const bothLow = recentTwo.every(
    (r) =>
      r.metadata?.confidence &&
      r.metadata.confidence < THRESHOLDS.LOW_CONFIDENCE_SCORE,
  );

  if (bothLow) {
    logger.info(`Consistently low AI confidence detected`);
    return {
      shouldHandover: true,
      immediate: false,
      reason: "low_ai_confidence",
      confidence: 0.7,
      message: "AI confidence consistently low — human agent recommended",
    };
  }

  return null;
};

/**
 * Main handover analysis
 *
 * @param {string} currentMessage
 * @param {Array} conversationHistory
 * @param {Object} options - { aiResponses, collectedEntities }
 * @returns {Object|null}
 */
export const analyzeHandoverNeed = (
  currentMessage,
  conversationHistory = [],
  options = {},
) => {
  logger.debug("Analyzing handover need...");

  const collectedEntities = options.collectedEntities || {};

  // Priority 1: Immediate — no identity check needed
  const immediate = detectImmediateHandover(currentMessage);
  if (immediate) return immediate;

  // Priority 2: Assisted complex query
  const complex = detectAssistedHandover(currentMessage);
  if (complex) {
    // If we already have identity, can hand over immediately
    if (hasCustomerIdentity(collectedEntities)) {
      return { ...complex, immediate: true };
    }
    return complex; // immediate: false → AI will gather info first
  }

  // Priority 3: Frustration
  const frustration = detectFrustration(currentMessage);
  if (frustration) {
    if (hasCustomerIdentity(collectedEntities)) {
      return { ...frustration, immediate: true };
    }
    return frustration;
  }

  // Priority 4: Repetitive questions
  const repetitive = detectRepetitiveQuestions(conversationHistory);
  if (repetitive) {
    if (hasCustomerIdentity(collectedEntities)) {
      return { ...repetitive, immediate: true };
    }
    return repetitive;
  }

  // Priority 5: Prolonged back-and-forth
  const backAndForth = detectBackAndForth(conversationHistory);
  if (backAndForth) {
    if (hasCustomerIdentity(collectedEntities)) {
      return { ...backAndForth, immediate: true };
    }
    return backAndForth;
  }

  // Priority 6: Low confidence (needs aiResponses passed via options)
  if (options.aiResponses) {
    const lowConfidence = detectLowConfidence(options.aiResponses);
    if (lowConfidence) {
      if (hasCustomerIdentity(collectedEntities)) {
        return { ...lowConfidence, immediate: true };
      }
      return lowConfidence;
    }
  }

  return null;
};

export const getHandoverStats = () => ({
  thresholds: THRESHOLDS,
  patterns: {
    immediateHandover: IMMEDIATE_HANDOVER_PATTERNS.length,
    assistedHandover: ASSISTED_HANDOVER_PATTERNS.length,
    frustration: FRUSTRATION_PATTERNS.length,
  },
});

export default { analyzeHandoverNeed, getHandoverStats };
