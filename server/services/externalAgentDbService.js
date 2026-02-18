/**
 * External Agent Database Connector
 * 
 * Provides a flexible interface to connect to external databases
 * for fetching agent information. Supports multiple database types.
 * 
 * Configuration should be provided via environment variables:
 * - EXTERNAL_AGENT_DB_ENABLED=true
 * - EXTERNAL_AGENT_DB_TYPE=mysql|postgres|mssql|api
 * - EXTERNAL_AGENT_DB_URI=connection_string
 * - EXTERNAL_AGENT_API_URL=api_endpoint (for API type)
 * - EXTERNAL_AGENT_API_KEY=api_key (for API type)
 */

import { Sequelize } from 'sequelize';
import logger from '../utils/logger.js';
import axios from 'axios';
import Client from '#models/clients.js';

// Cache for external connections
let externalConnection = null;
let connectionType = null;
let lastConnectionTime = null;

// Connection health check interval (5 minutes)
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;


// Simple in-memory cache
let agentCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedAgents = () => {
    if (agentCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        logger.debug('Returning cached external agents');
        return agentCache;
    }
    return null;
};

const setCachedAgents = (agents) => {
    agentCache = agents;
    cacheTimestamp = Date.now();
};

/**
 * Configuration from environment variables
 */
const getExternalDBConfig = () => {
    return {
        enabled: process.env.EXTERNAL_AGENT_DB_ENABLED === 'true',
        type: process.env.EXTERNAL_AGENT_DB_TYPE || 'mysql', // mysql|postgres|mssql|api
        uri: process.env.EXTERNAL_AGENT_DB_URI || null,
        apiUrl: process.env.EXTERNAL_AGENT_API_URL || null,
        apiKey: process.env.EXTERNAL_AGENT_API_KEY || null,
        tableName: process.env.EXTERNAL_AGENT_TABLE_NAME || 'agents',
        // Custom field mappings (in case external DB has different column names)
        fieldMappings: {
            id: process.env.EXTERNAL_AGENT_FIELD_ID || 'id',
            name: process.env.EXTERNAL_AGENT_FIELD_NAME || 'name',
            email: process.env.EXTERNAL_AGENT_FIELD_EMAIL || 'email',
            status: process.env.EXTERNAL_AGENT_FIELD_STATUS || 'status',
            clientId: process.env.EXTERNAL_AGENT_FIELD_CLIENT_ID || 'client_id',
            maxChats: process.env.EXTERNAL_AGENT_FIELD_MAX_CHATS || 'max_concurrent_chats',
            currentChats: process.env.EXTERNAL_AGENT_FIELD_CURRENT_CHATS || 'current_chat_count',
            department: process.env.EXTERNAL_AGENT_FIELD_DEPARTMENT || 'department',
            skills: process.env.EXTERNAL_AGENT_FIELD_SKILLS || 'skills',
        }
    };
};

/**
 * Initialize external database connection (for SQL databases)
 */
const initializeConnection = async () => {
    const config = getExternalDBConfig();
    
    if (!config.enabled) {
        logger.info('External agent database is disabled');
        return null;
    }
    
    if (config.type === 'api') {
        connectionType = 'api';
        logger.info('External agent source configured as API');
        return 'api';
    }
    
    if (!config.uri) {
        logger.warn('External agent database enabled but no URI provided');
        return null;
    }
    
    try {
        logger.info(`Initializing external agent database connection (${config.type})...`);
        
        const connection = new Sequelize(config.uri, {
            dialect: config.type,
            logging: false,
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        });
        
        // Test connection
        await connection.authenticate();
        logger.info(`✅ External agent database connected (${config.type})`.green);
        
        externalConnection = connection;
        connectionType = config.type;
        lastConnectionTime = Date.now();
        
        return connection;
    } catch (error) {
        logger.error(`❌ Failed to connect to external agent database: ${error.message}`);
        return null;
    }
};

/**
 * Check connection health and reconnect if needed
 */

const ensureConnection = async () => {
    const config = getExternalDBConfig();
    
    if (!config.enabled) {
        return null;
    }
    
    if (connectionType === 'api') {
        return 'api';
    }
    
    // If connection exists and is recent, return it
    if (externalConnection && lastConnectionTime && 
        (Date.now() - lastConnectionTime < HEALTH_CHECK_INTERVAL)) {
        return externalConnection;
    }
    
    // Otherwise, reinitialize
    return await initializeConnection();
};

/**
 * Fetch agents from API endpoint
 */


const fetchAgentsFromAPI = async (clientId) => {
    const config = getExternalDBConfig();

    const cached = getCachedAgents();
    if (cached) {
        return cached;
    }

    if (!config.apiUrl) {
        throw new Error('External agent API URL not configured');
    }

    try {
        const headers = {};
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const client = await Client.findOne({ where: { id: clientId } });
        if (!client) {
            logger.warn(`Client with ID ${clientId} not found in database`);
            return [];
        } 
        const productId = client.product_id || 'unknown'; 
        console.log(`Product ID: ${productId}`);

        console.log(`Fetching agents from API for client ${clientId} (${client.name}) at ${config.apiUrl}`);
        const response = await axios.get(`${config.apiUrl}/${productId}`, {
            headers,
            timeout: 5000
        }).catch(error => {
            logger.error(`Error fetching agents from API: ${error.message}`);
            throw error;
        });
        console.log('API response:', response.data);

        // getAllSupport returns { data: [...] }
        const agents = Array.isArray(response.data)
            ? response.data
            : Array.isArray(response.data?.data)
                ? response.data.data
                : [];

        if (agents.length === 0) {
            logger.warn('External API returned no agents');
            return [];
        }

        logger.debug(`Fetched ${agents.length} agents from CRM`);
        const normalizedAgents = agents.map(agent => normalizeAgentData(agent, config.fieldMappings));
        setCachedAgents(normalizedAgents);
        return normalizedAgents;

    } catch (error) {
        logger.error(`Failed to fetch agents from external API: ${error.message}`);
        throw error;
    }
};

/**
 * Fetch agents from SQL database
 */

const fetchAgentsFromSQL = async (clientId, filters = {}) => {
    const connection = await ensureConnection();
    
    if (!connection || connection === 'api') {
        return [];
    }
    
    const config = getExternalDBConfig();
    const fields = config.fieldMappings;
    
    try {
        // Build WHERE conditions
        const conditions = [];
        const replacements = {};
        
        // Client ID filter
        conditions.push(`${fields.clientId} = :clientId`);
        replacements.clientId = clientId;
        
        // Status filter (default to 'online')
        if (filters.status) {
            conditions.push(`${fields.status} = :status`);
            replacements.status = filters.status;
        } else {
            conditions.push(`${fields.status} = 'online'`);
        }
        
        // Availability filter (agents with capacity)
        if (filters.requireAvailability) {
            conditions.push(`${fields.currentChats} < ${fields.maxChats}`);
        }
        
        // Department filter
        if (filters.department) {
            conditions.push(`${fields.department} = :department`);
            replacements.department = filters.department;
        }
        
        const whereClause = conditions.join(' AND ');
        
        const query = `
            SELECT 
                ${fields.id} as id,
                ${fields.name} as name,
                ${fields.email} as email,
                ${fields.status} as status,
                ${fields.clientId} as client_id,
                ${fields.maxChats} as max_concurrent_chats,
                ${fields.currentChats} as current_chat_count,
                ${fields.department} as department,
                ${fields.skills} as skills
            FROM ${config.tableName}
            WHERE ${whereClause}
            ORDER BY ${fields.currentChats} ASC
        `;
        
        const [results] = await connection.query(query, {
            replacements,
            type: Sequelize.QueryTypes.SELECT
        });
        
        logger.debug(`Fetched ${results.length} agents from external database`);
        return results;
    } catch (error) {
        logger.error(`Failed to fetch agents from external SQL database: ${error.message}`);
        throw error;
    }
};

/**
 * Normalize agent data to standard format
 */
const normalizeAgentData = (agent, fieldMappings) => {
    return {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        status: agent.status || 'online', // default to online
        client_id: agent.client_id || null,
        max_concurrent_chats: 5,          // default since CRM doesn't track this
        current_chat_count: 0,            // default
        department: agent.department || null,
        skills: agent.skills || null,
        source: 'external'
    };
};

/**
 * Get available agents from external source
 * 
 * @param {number} clientId - Client/tenant ID
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} List of available agents
 */
export const getExternalAgents = async (clientId) => {
    const config = getExternalDBConfig();
    
    if (!config.enabled) {
        return [];
    }
    
    try {
        if (config.type === 'api') {
            return await fetchAgentsFromAPI(clientId);
        } else {
            return await fetchAgentsFromSQL(clientId, filters);
        }
    } catch (error) {
        logger.error(`Error fetching external agents: ${error.message}`);
        // Return empty array on error - allow fallback to local agents
        return [];
    }
};

/**
 * Update agent status in external database (if supported)
 * This is optional - some external systems may handle this internally
 * 
 * @param {number} agentId - Agent ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateExternalAgent = async (agentId, updates = {}) => {
    const config = getExternalDBConfig();
    
    if (!config.enabled) {
        return false;
    }
    
    try {
        if (config.type === 'api') {
            // If API, make PUT/PATCH request
            if (!config.apiUrl) {
                return false;
            }
            
            const headers = {};
            if (config.apiKey) {
                headers['Authorization'] = `Bearer ${config.apiKey}`;
            }
            
            await axios.patch(`${config.apiUrl}/${agentId}`, updates, {
                headers,
                timeout: 5000
            });
            
            return true;
        } else {
            // If SQL, run UPDATE query
            const connection = await ensureConnection();
            if (!connection) {
                return false;
            }
            
            const fields = config.fieldMappings;
            const setClauses = [];
            const replacements = { agentId };
            
            // Map update fields to external DB columns
            if (updates.currentChatCount !== undefined) {
                setClauses.push(`${fields.currentChats} = :currentChatCount`);
                replacements.currentChatCount = updates.currentChatCount;
            }
            
            if (updates.status) {
                setClauses.push(`${fields.status} = :status`);
                replacements.status = updates.status;
            }
            
            if (setClauses.length === 0) {
                return false;
            }
            
            const query = `
                UPDATE ${config.tableName}
                SET ${setClauses.join(', ')}
                WHERE ${fields.id} = :agentId
            `;
            
            await connection.query(query, {
                replacements,
                type: Sequelize.QueryTypes.UPDATE
            });
            
            return true;
        }
    } catch (error) {
        logger.error(`Failed to update external agent: ${error.message}`);
        return false;
    }
};

/**
 * Test external database connection
 * 
 * @returns {Promise<Object>} Connection status and details
 */
export const testExternalConnection = async () => {
    const config = getExternalDBConfig();
    
    if (!config.enabled) {
        return {
            enabled: false,
            message: 'External agent database is disabled'
        };
    }
    
    try {
        if (config.type === 'api') {
            // Test API connection
            const headers = {};
            if (config.apiKey) {
                headers['Authorization'] = `Bearer ${config.apiKey}`;
            }
            
            await axios.get(config.apiUrl, { headers, timeout: 5000 });
            
            return {
                enabled: true,
                connected: true,
                type: 'api',
                message: 'API connection successful'
            };
        } else {
            // Test SQL connection
            const connection = await ensureConnection();
            if (connection && connection !== 'api') {
                await connection.authenticate();
                return {
                    enabled: true,
                    connected: true,
                    type: config.type,
                    message: 'Database connection successful'
                };
            } else {
                return {
                    enabled: true,
                    connected: false,
                    type: config.type,
                    message: 'Failed to establish database connection'
                };
            }
        }
    } catch (error) {
        return {
            enabled: true,
            connected: false,
            type: config.type,
            error: error.message,
            message: 'Connection test failed'
        };
    }
};

/**
 * Close external database connection
 */
export const closeExternalConnection = async () => {
    if (externalConnection && connectionType !== 'api') {
        try {
            await externalConnection.close();
            logger.info('External agent database connection closed');
        } catch (error) {
            logger.error(`Error closing external connection: ${error.message}`);
        }
    }
    
    externalConnection = null;
    connectionType = null;
    lastConnectionTime = null;
};

export default {
    getCachedAgents,
    setCachedAgents,
    getExternalAgents,
    updateExternalAgent,
    testExternalConnection,
    closeExternalConnection,
    initializeConnection
};
