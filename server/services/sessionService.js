import SessionContext from "#models/sessionContext.js";
import ChatRoom from "#models/chatrooms.js";
import Message from "#models/messages.js";
import { Op} from "sequelize";
import connectDB from "#config/db.js";

const sequelize = await connectDB();

const CONFIG = {
    MESSAGE_LIMIT:50,
    SESSION_EXPIRY_DAYS: 2,
    SESSION_EXPIRY_MS:7 * 24 * 60 * 60 * 1000
}

/**
 * validate required inputs and client isolation
 */

const validateInputs = ({ roomId, clientId, sessionToken, visitorId }) => {
  if (!clientId) throw new Error('clientId is required');
  if (!roomId && !sessionToken) throw new Error('roomId or sessionToken required');

  // roomId and clientId can be numbers (BIGINT)
  if (roomId && typeof roomId !== 'number' && typeof roomId !== 'string') {
    throw new Error('roomId must be a number or string');
  }
  if (clientId && typeof clientId !== 'number' && typeof clientId !== 'string') {
    throw new Error('clientId must be a number or string');
  }

  // sessionToken and visitorId must be strings
  if (sessionToken && typeof sessionToken !== 'string') {
    throw new Error('sessionToken must be a string');
  }
  if (visitorId && typeof visitorId !== 'string') {
    throw new Error('visitorId must be a string');
  }
};

/**
 * base query options with tenant isolation
 */

const baseContextQuery = (roomId, clientId) => ({
  where: {
    room_id: roomId,
    client_id: clientId
  }
});


/**
 * create or get session context 
 */

const getOrCreateContext = async (roomId, clientId, transaction = null) => {
    validateInputs({ roomId, clientId });

    const options = {
        ...baseContextQuery(roomId, clientId),
        defaults: {
            room_id: roomId,
            client_id: clientId,
            collected_entities: {},
            workflow_state: {},
        }
    };

    if (transaction) {
        options.transaction = transaction;
    }

    const [context] = await SessionContext.findOrCreate(options);

    return context;
};


/**
 * update entries with merge
 */

const updateEntities = async (roomId, clientId, newEntities, transaction = null) => {
    validateInputs({ roomId, clientId});

    if(!newEntities || typeof newEntities !== 'object') {
        throw new Error('newEntities must be a valid object');
    }

    const context = await getOrCreateContext(roomId, clientId, transaction);

    context.collected_entities = {
        ...context.collected_entities,
        ...newEntities
    };

    context.updated_at = new Date();
    
    await context.save({ transaction });

    return context;
};

/**
 * Update workflow state atomically
 */
const updateWorkflow = async (roomId, clientId, workflow, state, transaction = null) => {
  validateInputs({ roomId, clientId });
  
  if (!workflow || typeof state !== 'object') {
    throw new Error('Valid workflow and state object required');
  }

  const context = await getOrCreateContext(roomId, clientId, transaction);
  
  context.current_workflow = workflow;
  context.workflow_state = state;
  context.updated_at = new Date();
  await context.save({ transaction });
  
  return context;
};

/**
 * Extract and store customer identity (email, name) from message
 * @param {number} roomId - Room ID
 * @param {number} clientId - Client ID
 * @param {string} message - User message to extract identity from
 * @returns {Promise<Object>} Updated context with customer identity
 */
const extractAndStoreCustomerIdentity = async (roomId, clientId, message) => {
  validateInputs({ roomId, clientId });
  
  const context = await getOrCreateContext(roomId, clientId);
  
  // Check if we already have complete customer identity
  if (context.collected_entities?.customer_email && context.collected_entities?.customer_name) {
    console.log(`[Identity] Already have identity: ${context.collected_entities.customer_name} (${context.collected_entities.customer_email})`);
    return context;
  }
  
  // Extract email using regex
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const emailMatch = message.match(emailRegex);
  
  // Extract potential name patterns - more flexible matching
  const namePatterns = [
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+is my name/i,
    /(?:my name is|name is)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /(?:i'm|i am|this is)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+and my email/i,
  ];
  
  let nameMatch = null;
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      nameMatch = match[1];
      break;
    }
  }
  
  // Update entities if we found something
  let updated = false;
  const newEntities = { ...context.collected_entities };
  
  if (emailMatch && !newEntities.customer_email) {
    newEntities.customer_email = emailMatch[0].toLowerCase();
    newEntities.customer_verified = true;
    newEntities.verified_at = new Date().toISOString();
    updated = true;
    console.log(`[Identity] Extracted email: ${newEntities.customer_email}`);
  }
  
  if (nameMatch && !newEntities.customer_name) {
    newEntities.customer_name = nameMatch.trim();
    updated = true;
    console.log(`[Identity] Extracted name: ${newEntities.customer_name}`);
  }
  
  if (updated) {
    context.collected_entities = newEntities;
    context.updated_at = new Date();
    await context.save();
    console.log(`[Identity] Saved identity to DB: ${newEntities.customer_name} (${newEntities.customer_email})`);
  }
  
  return context;
};

/**
 * Get customer identity string for prompts
 * @param {number} roomId - Room ID
 * @param {number} clientId - Client ID
 * @returns {Promise<string>} Formatted customer identity
 */
const getCustomerIdentity = async (roomId, clientId) => {
  validateInputs({ roomId, clientId });
  
  const context = await getOrCreateContext(roomId, clientId);
  const entities = context.collected_entities || {};
  
  if (entities.customer_email && entities.customer_name) {
    return `${entities.customer_name} (${entities.customer_email})`;
  } else if (entities.customer_email) {
    return entities.customer_email;
  } else if (entities.customer_name) {
    return entities.customer_name;
  }
  
  return 'Unknown';
};


//clear workflow data

const clearWorkflow = async (roomId, clientId, transaction = null) => {
  validateInputs({ roomId, clientId });
  
  const context = await SessionContext.findOne({
    ...baseContextQuery(roomId, clientId),
    transaction
  });
  
  if (context) {
    context.current_workflow = null;
    context.workflow_state = {};
    context.updated_at = new Date();
    await context.save({ transaction });
  }
  
  return context;
};

/**
 * get complete session data
 */

const getFullSession = async (roomId, clientId, transaction = null) => {
  validateInputs({ roomId, clientId });
  
  const queryOptions = {
    where: {
      id: roomId,
      client_id: clientId
    }
  };

  if (transaction) {
    queryOptions.transaction = transaction;
  }

  const room = await ChatRoom.findOne(queryOptions);
  
  if (!room) return null;

  const messageOptions = {
    where: { room_id: roomId },
    order: [['created_at', 'ASC']], 
    limit: CONFIG.MESSAGE_LIMIT
  };

  if (transaction) {
    messageOptions.transaction = transaction;
  }

  const [messages, context] = await Promise.all([
    Message.findAll(messageOptions),
    getOrCreateContext(roomId, clientId, transaction)
  ]);

  return {
    room,
    messages,
    context
  };
};


/**
 * resume/create session by token
 */

const resumeOrCreateSession = async (clientId, sessionToken, visitorId, roomId = null) => {
  validateInputs({ clientId, sessionToken, visitorId });
  
  const t = await sequelize.transaction();
  
  try {
    let room;

    if (roomId) {
      // RESUMING EXISTING CONVERSATION
      // User clicked on a previous chat from history
      room = await ChatRoom.findOne({
        where: {
          id: roomId,
          client_id: clientId,
          widget_visitor_id: visitorId, // Verify it belongs to this visitor
          status: 'active'
        },
        transaction: t
      });

      if (!room) {
        throw new Error(`Room ${roomId} not found or not accessible for this visitor`);
      }

      // Update activity timestamp
      room.last_activity_at = new Date();
      await room.save({ transaction: t });

    } else {
      // STARTING NEW CONVERSATION
      // User clicked "Send us a message"
      // Try to find existing session with this token (shouldn't exist for new chats)
      room = await ChatRoom.findOne({
        where: {
          session_token: sessionToken,
          client_id: clientId,
          widget_visitor_id: visitorId,
          status: 'active',
          last_activity_at: {
            [Op.gte]: new Date(Date.now() - CONFIG.SESSION_EXPIRY_MS)
          }
        },
        transaction: t
      });

      // If no existing room found, create new one
      if (!room) {
        room = await ChatRoom.create({
          client_id: clientId,
          session_token: sessionToken,
          widget_visitor_id: visitorId, // Same visitorId across all conversations
          status: 'active',
          last_activity_at: new Date()
        }, { transaction: t });
        
        console.log(`✅ Created new room ${room.id} for visitor ${visitorId}`);
      } else {
        console.log(`✅ Resumed room ${room.id} for visitor ${visitorId}`);
      }
    }

    // Get full session data (room + messages + context)
    const sessionData = await getFullSession(room.id, clientId, t);
    await t.commit();
    
    return sessionData;
    
  } catch (error) {
    await t.rollback();
    console.error('❌ resumeOrCreateSession error:', error.message);
    console.error('   ClientId:', clientId, 'SessionToken:', sessionToken, 'VisitorId:', visitorId, 'RoomId:', roomId);
    throw error;
  }
};


/**
 * Track activity 
 */
const trackActivity = async (roomId, clientId) => {
  validateInputs({ roomId, clientId });
  
  const [updated] = await ChatRoom.update(
    { last_activity_at: new Date() },
    { 
      where: { 
        id: roomId,
        client_id: clientId 
      }
    }
  );
  
  return updated > 0;
};


/**
 * Close session with cleanup
 */
const closeSession = async (roomId, clientId) => {
  validateInputs({ roomId, clientId });
  
  const t = await sequelize.transaction();
  
  try {
    const room = await ChatRoom.findByPk(roomId, {
      where: { client_id: clientId },
      transaction: t
    });
    
    if (!room) {
      await t.commit();
      return null;
    }
    
    room.status = 'closed';
    room.closed_at = new Date();
    await room.save({ transaction: t });
    
    await clearWorkflow(roomId, clientId);
    
    await t.commit();
    return room;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const SessionContextService = {
  getOrCreateContext,
  updateEntities,
  updateWorkflow,
  clearWorkflow,
  getFullSession,
  resumeOrCreateSession,
  trackActivity,
  closeSession,
  extractAndStoreCustomerIdentity,
  getCustomerIdentity
};