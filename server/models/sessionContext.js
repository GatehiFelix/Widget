import { DataTypes } from 'sequelize';
import connectDB from '../config/db.js';  

const sequelize = await connectDB();  

const SessionContext = sequelize.define('SessionContext', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    room_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {     
            model: 'chat_rooms',
            key: 'id'
        }
    },
    client_id: {        
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'clients',  
            key: 'id'
        }
    },
    collected_entities: {
        type: DataTypes.JSON,  
        defaultValue: {},      
        allowNull: false
    },
    current_workflow: {
        type: DataTypes.STRING(100),  
        allowNull: true
    },
    workflow_state: {         
        type: DataTypes.JSON,
        defaultValue: {},
        allowNull: false
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
}, {
    tableName: 'session_contexts',
    timestamps: false,
    indexes: [
        { 
            fields: ['room_id', 'client_id'],  
            unique: true, 
            name: 'unique_room_client'
        },
        { fields: ['client_id'] },
        { fields: ['updated_at'] },
        { fields: ['room_id'] }  
    ]
});

// Associations defined in models/index.js to avoid circular dependencies

export default SessionContext;
