import connectDB from '../config/db.js';

// Get sequelize instance first
const sequelize = await connectDB();

// Import models AFTER connection established
import Client from './clients.js';
import User from './users.js';
import ChatRoom from './chatrooms.js';
import Message from './messages.js';
import SessionContext from './sessionContext.js';

// Client associations
Client.hasMany(User, { foreignKey: 'client_id' });
Client.hasMany(ChatRoom, { foreignKey: 'client_id' });
Client.hasMany(Message, { foreignKey: 'client_id' });

// User associations
User.belongsTo(Client, { foreignKey: 'client_id' });
User.hasMany(ChatRoom, { foreignKey: 'assigned_agent_id' });
User.hasMany(Message, { foreignKey: 'sender_id' });

// ChatRoom associations
ChatRoom.belongsTo(Client, { foreignKey: 'client_id' });
ChatRoom.belongsTo(User, { foreignKey: 'assigned_agent_id' });
ChatRoom.hasMany(Message, { foreignKey: 'room_id' });
ChatRoom.hasOne(SessionContext, { foreignKey: 'room_id' });

// Message associations
Message.belongsTo(ChatRoom, { foreignKey: 'room_id' });
Message.belongsTo(Client, { foreignKey: 'client_id' });
Message.belongsTo(User, { foreignKey: 'sender_id' });

// SessionContext associations
SessionContext.belongsTo(ChatRoom, { foreignKey: 'room_id' });
SessionContext.belongsTo(Client, { foreignKey: 'client_id' });

async function syncModels(options = {}) {
    const { force = false, alter = false } = options;
    
    try {
        console.log('Syncing database models...'.yellow);
        
        // Only sync structure, don't alter (prevents duplicate indexes)
        // Use force: true only for fresh start, or manually run migrations
        if (force) {
            await sequelize.sync({ force: true });
        } else {
            // Just validate, don't alter
            await sequelize.sync();
        }
        
        console.log('All models synced successfully'.green.bold);
    } catch (error) {
        console.error('Model sync failed:', error.message);
        throw error;
    }
}

export {
    sequelize,
    Client,
    User,
    ChatRoom,
    Message,
    SessionContext,
    syncModels
};
