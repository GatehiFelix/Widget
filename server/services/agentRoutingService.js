import { User } from '#models/index.js';
import { getExternalAgents, updateExternalAgent } from '#services/externalAgentService.js';
import { Op } from 'sequelize';
import logger from '#utils/logger.js';

// In-memory queue for customers waiting for agents
// Structure: { clientId, roomId, priority, department, timestamp, customerInfo }
const waitingQueue = new Map();

// Track agent assignments to sync state
const agentAssignments = new Map(); // agentId -> { source: 'local'|'external', currentChats, maxChats }

// Queue priority levels
const PRIORITY = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    VIP: 3
};

// Configuration
const CONFIG = {
    ENABLE_EXTERNAL_AGENTS: process.env.EXTERNAL_AGENT_DB_ENABLED === 'true',
    PREFER_LOCAL_AGENTS: process.env.PREFER_LOCAL_AGENTS === 'true',
    ROUND_ROBIN_ENABLED: process.env.AGENT_ROUND_ROBIN === 'true',
    SKILL_BASED_ROUTING: process.env.SKILL_BASED_ROUTING === 'true',
    QUEUE_TIMEOUT_MS: parseInt(process.env.QUEUE_TIMEOUT_MS || '600000'), // 10 minutes default
};

/**
 * Get available agents from local database
 */
const getLocalAgents = async (clientId, filters = {}) => {
    try {
        const where = {
            client_id: clientId,
            role: 'agent',
            status: filters.status || 'online',
            current_chat_count: {
                [Op.lt]: Op.col('max_concurrent_chats')
            }
        };
        
        // Add department filter if specified
        if (filters.department) {
            where.department = filters.department;
        }
        
        const agents = await User.findAll({
            where,
            order: [['current_chat_count', 'ASC']],
            attributes: [
                'id', 'name', 'email', 'status', 'client_id',
                'max_concurrent_chats', 'current_chat_count', 
                'department', 'skills'
            ]
        });
        
        // Add source identifier
        return agents.map(agent => ({
            ...agent.toJSON(),
            source: 'local'
        }));
    } catch (error) {
        logger.error(`Error fetching local agents: ${error.message}`);
        return [];
    }
};

/**
 * Get all available agents from both local and external sources
 */
const getAllAvailableAgents = async (clientId, filters = {}) => {
    const agents = [];
    
    // Fetch local agents
    const localAgents = await getLocalAgents(clientId, filters);
    agents.push(...localAgents);
    
    // Fetch external agents if enabled
    if (CONFIG.ENABLE_EXTERNAL_AGENTS) {
        try {
            const externalAgents = await getExternalAgents(clientId, {
                ...filters,
                requireAvailability: true
            });
            agents.push(...externalAgents);
            logger.debug(`Fetched ${externalAgents.length} external agents`);
        } catch (error) {
            logger.error(`External agents fetch failed: ${error.message}`);  
        }
    }
    
    logger.debug(`Found ${agents.length} available agents (${localAgents.length} local)`);
    return agents;
};

/**
 * Score and rank agents based on routing criteria
 */
const scoreAgent = (agent, criteria = {}) => {
    let score = 0;
    
    // Base score: inversely proportional to current load
    const loadRatio = agent.current_chat_count / agent.max_concurrent_chats;
    score += (1 - loadRatio) * 100;
    
    // Skill matching (if enabled and skills provided)
    if (CONFIG.SKILL_BASED_ROUTING && criteria.requiredSkills && agent.skills) {
        try {
            const agentSkills = typeof agent.skills === 'string' 
                ? JSON.parse(agent.skills) 
                : agent.skills;
            
            const matchedSkills = criteria.requiredSkills.filter(skill => 
                agentSkills.includes(skill)
            );
            
            score += matchedSkills.length * 20;
        } catch (error) {
            // Skip skill scoring if parsing fails
        }
    }
    
    // Department preference
    if (criteria.department && agent.department === criteria.department) {
        score += 30;
    }
    
    // Local agent preference (if enabled)
    if (CONFIG.PREFER_LOCAL_AGENTS && agent.source === 'local') {
        score += 10;
    }
    
    return score;
};

/**
 * Select best agent using scoring algorithm
 */
const selectBestAgent = (agents, criteria = {}) => {
    if (agents.length === 0) {
        return null;
    }
    
    if (agents.length === 1) {
        return agents[0];
    }
    
    // Score all agents
    const scoredAgents = agents.map(agent => ({
        agent,
        score: scoreAgent(agent, criteria)
    }));
    
    // Sort by score (descending)
    scoredAgents.sort((a, b) => b.score - a.score);
    
    logger.debug(`Agent scoring: ${scoredAgents.map(a => `${a.agent.name}(${a.score})`).join(', ')}`);
    
    return scoredAgents[0].agent;
};

/**
 * Increment agent's chat count
 */
const incrementAgentChatCount = async (agent) => {
    try {
        if (agent.source === 'local') {
            await User.increment('current_chat_count', {
                where: { id: agent.id }
            });
        } else if (agent.source === 'external') {
            await updateExternalAgent(agent.id, {
                currentChatCount: agent.current_chat_count + 1
            });
        }
        
        // Update in-memory tracking
        agentAssignments.set(agent.id, {
            source: agent.source,
            currentChats: agent.current_chat_count + 1,
            maxChats: agent.max_concurrent_chats
        });
        
        logger.debug(`Incremented chat count for agent ${agent.name} (${agent.id})`);
    } catch (error) {
        logger.error(`Failed to increment agent chat count: ${error.message}`);
    }
};

/**
 * Decrement agent's chat count
 */
const decrementAgentChatCount = async (agentId, source = 'local') => {
    try {
        if (source === 'local') {
            await User.decrement('current_chat_count', {
                where: { id: agentId }
            });
        } else if (source === 'external') {
            const agent = agentAssignments.get(agentId);
            if (agent) {
                await updateExternalAgent(agentId, {
                    currentChatCount: Math.max(0, agent.currentChats - 1)
                });
            }
        }
        
        // Update in-memory tracking
        const agent = agentAssignments.get(agentId);
        if (agent) {
            agent.currentChats = Math.max(0, agent.currentChats - 1);
        }
        
        logger.debug(`Decremented chat count for agent ${agentId}`);
    } catch (error) {
        logger.error(`Failed to decrement agent chat count: ${error.message}`);
    }
};

/**
 * Add customer to waiting queue
 */
const addToQueue = (clientId, roomId, options = {}) => {
    const queueEntry = {
        clientId,
        roomId,
        priority: options.priority || PRIORITY.NORMAL,
        department: options.department || null,
        requiredSkills: options.requiredSkills || [],
        timestamp: Date.now(),
        customerInfo: options.customerInfo || {}
    };
    
    waitingQueue.set(roomId, queueEntry);
    
    logger.info(`Customer added to queue: Room ${roomId}, Position: ${getQueuePosition(roomId)}`);
    
    return queueEntry;
};

/**
 * Remove customer from queue
 */

const removeFromQueue = (roomId) => {
    const removed = waitingQueue.delete(roomId);
    if (removed) {
        logger.debug(`Customer removed from queue: Room ${roomId}`);
    }
    return removed;
};

/**
 * Get customer's position in queue
 */

const getQueuePosition = (roomId) => {
    const entry = waitingQueue.get(roomId);
    if (!entry) {
        return -1;
    }
    
    // Get all entries sorted by priority (desc) and timestamp (asc)
    const sortedQueue = Array.from(waitingQueue.values()).sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
    });
    
    return sortedQueue.findIndex(e => e.roomId === roomId) + 1;
};

/**
 * Get queue statistics
 */

const getQueueStats = () => {
    const queue = Array.from(waitingQueue.values());
    
    return {
        total: queue.length,
        byPriority: {
            vip: queue.filter(e => e.priority === PRIORITY.VIP).length,
            high: queue.filter(e => e.priority === PRIORITY.HIGH).length,
            normal: queue.filter(e => e.priority === PRIORITY.NORMAL).length,
            low: queue.filter(e => e.priority === PRIORITY.LOW).length
        },
        oldestWaitTime: queue.length > 0 
            ? Date.now() - Math.min(...queue.map(e => e.timestamp))
            : 0
    };
};

/**
 * Process queue and assign available agents
 * This should be called periodically or when an agent becomes available
 */

const processQueue = async () => {
    if (waitingQueue.size === 0) {
        return;
    }
    
    logger.debug(`Processing queue with ${waitingQueue.size} waiting customers`);
    
    // Get sorted queue (priority first, then FIFO)
    const sortedQueue = Array.from(waitingQueue.values()).sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
    });
    
    // Try to assign agents to waiting customers
    for (const queueEntry of sortedQueue) {
        // Check if entry has timed out
        if (Date.now() - queueEntry.timestamp > CONFIG.QUEUE_TIMEOUT_MS) {
            logger.warn(`Queue entry timed out for room ${queueEntry.roomId}`);
            removeFromQueue(queueEntry.roomId);
            continue;
        }
        
        // Try to find available agent
        const agents = await getAllAvailableAgents(queueEntry.clientId, {
            department: queueEntry.department
        });
        
        if (agents.length > 0) {
            const agent = selectBestAgent(agents, {
                department: queueEntry.department,
                requiredSkills: queueEntry.requiredSkills
            });
            
            if (agent) {
                // Assign agent (this would trigger the actual assignment in chatService)
                logger.info(`Assigning agent ${agent.name} to queued customer (Room ${queueEntry.roomId})`);
                
                // Note: Actual assignment should be done by caller
                // This just identifies the match
                return {
                    queueEntry,
                    agent
                };
            }
        }
    }
    
    return null;
};

/**
 * Main function: Find and assign an agent to a customer
 * 
 * @param {number} clientId - Client/tenant ID
 * @param {number} roomId - Chat room ID
 * @param {Object} options - Routing options (priority, department, skills, etc.)
 * @returns {Promise<Object>} Assignment result with agent info or queue status
 */

export const assignAgent = async (clientId, roomId, options = {}) => {
    try {
        logger.info(`Attempting to assign agent for Room ${roomId}, Client ${clientId}`);
        
        // Get all available agents
        const agents = await getAllAvailableAgents(clientId, {
            department: options.department,
            status: 'online'
        });
        
        if (agents.length === 0) {
            // No agents available - add to queue
            logger.info('No agents available - adding to queue');
            const queueEntry = addToQueue(clientId, roomId, options);
            
            return {
                assigned: false,
                queued: true,
                position: getQueuePosition(roomId),
                estimatedWaitTime: calculateEstimatedWaitTime(),
                message: 'All our agents are currently busy. You have been added to the queue.'
            };
        }
        
        // Select best agent based on criteria
        const agent = selectBestAgent(agents, {
            department: options.department,
            requiredSkills: options.requiredSkills
        });
        
        if (!agent) {
            // Should not happen, but handle anyway
            const queueEntry = addToQueue(clientId, roomId, options);
            return {
                assigned: false,
                queued: true,
                position: getQueuePosition(roomId),
                message: 'No suitable agent found. You have been added to the queue.'
            };
        }
        
        // Increment agent's chat count
        await incrementAgentChatCount(agent);
        
        logger.info(`✅ Agent assigned: ${agent.name} (${agent.source}) to Room ${roomId}`);
        
        return {
            assigned: true,
            queued: false,
            agent: {
                id: agent.id,
                name: agent.name,
                email: agent.email,
                department: agent.department,
                source: agent.source
            },
            message: `You are now connected with ${agent.name}. How can they help you?`
        };
        
    } catch (error) {
        logger.error(`Error in agent assignment: ${error.message}`);
        throw error;
    }
};

/**
 * Release agent when chat is closed
 */

export const releaseAgent = async (agentId, source = 'local') => {
    try {
        await decrementAgentChatCount(agentId, source);
        
        // Process queue to assign newly available agent
        const assignment = await processQueue();
        if (assignment) {
            logger.info('Agent became available - processed queue assignment');
            return assignment;
        }
        
        return null;
    } catch (error) {
        logger.error(`Error releasing agent: ${error.message}`);
        throw error;
    }
};

/**
 * Calculate estimated wait time based on queue and agent availability
 */

const calculateEstimatedWaitTime = () => {
    const queueSize = waitingQueue.size;
    if (queueSize === 0) {
        return 0;
    }
    
    // Simple estimation: 5 minutes per person in queue
    // This should be improved with actual historical data
    return queueSize * 5 * 60 * 1000; // in milliseconds
};

/**
 * Get agent routing statistics
 */

export const getRoutingStats = () => {
    return {
        queue: getQueueStats(),
        agents: {
            activeAssignments: agentAssignments.size,
            assignments: Array.from(agentAssignments.entries()).map(([id, info]) => ({
                agentId: id,
                ...info
            }))
        },
        config: CONFIG
    };
};

/**
 * Clear timed-out queue entries (should be called periodically)
 */

export const cleanQueue = () => {
    const now = Date.now();
    let removed = 0;
    
    for (const [roomId, entry] of waitingQueue.entries()) {
        if (now - entry.timestamp > CONFIG.QUEUE_TIMEOUT_MS) {
            waitingQueue.delete(roomId);
            removed++;
        }
    }
    
    if (removed > 0) {
        logger.info(`Cleaned ${removed} timed-out queue entries`);
    }
    
    return removed;
};

export default {
    assignAgent,
    releaseAgent,
    addToQueue,
    removeFromQueue,
    getQueuePosition,
    getQueueStats,
    getRoutingStats,
    processQueue,
    cleanQueue,
    PRIORITY
};
