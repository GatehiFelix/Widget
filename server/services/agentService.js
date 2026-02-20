import agentClient from "../src/integrations/crmClient.js";
import Client  from "#models/clients.js";
import logger from "#utils/logger.js";


let _agentCache = null;
let _cacheExpiry = null;
const CACHE_TTL_MS =5 * 60 *1000;

const getCachedAgents = async () => {
    if(_agentCache && _cacheExpiry > Date.now() < _cacheExpiry) {
        return _agentCache;
    } 
    return null;
}

const setCachedAgents = (agents) => {
  _agentCache = agents;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
}

export const clearAgentCache = () => {
  _agentCache = null;
  _cacheExpiry = null;
};

// Normalize raw agents data from the agent backend
const normalizeAgent = (raw) => ({
    id: raw.id,
    name: raw.name || raw.full_name || "unknown",
    email: raw.email,
    phone: raw.phone || raw.extension || null,
    productId: raw.product_id || raw.productId || null,
    isAvailable: raw.is_availble || raw.isAvailable || false,
})


/**
 * @desc fetch agent availbale for  agiven client
 * @returns list of agents
 */

export const fetchAgents = async (clientId) => {
    const cached = await  getCachedAgents();
    if(cached) {
        logger.debug(`[AgentService] Returning ${cached.length} agents from cache`);
        return cached;
    }

    // resolve the productId for the client
    const client = await Client.findOne({ where: { id: clientId }});
    if(!client) {
        console.warn(`[AgentService] No client found with id ${clientId}`);
        return [];
    }

    const productId = client.product_id;
    
    let raw
    try {
        raw = await agentClient.getAgentsForProduct(productId);
    } catch (error) {
        console.log("error fetching agents from backend:", error.message);
        return [];
    }

    const agents = Array.isArray(raw) 
        ? raw
        : Array.isArray(raw.data)
            ? raw.data
            : [];

    if(!agents.length) {
        console.log(`[AgentService] No agents returned from backend for product ${productId}`);
        return [];
    }

    const normalized = agents.map(normalizeAgent);
    setCachedAgents(normalized)
    return normalized;
        
}

/**
 * pcick an agent from the list, uses round-robin
 */

export const selectAgent = (agents = []) => {
    const valid = agents.filter((a) => a.email && a.id !== 0 && a.isAvailable);
    if (!valid.length) return null;

    return valid.sort(
        (a, b) => (a.current_chat_count || 0) - (b.current_chat_count || 0)
    )[0];
};