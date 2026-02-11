import { DataTypes } from 'sequelize';
import connectDB from '../config/db.js';

const sequelize = await connectDB();

const Message = sequelize.define("Message", {
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
            key: "id"
        }
    },
    sender_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        comment: 'NULL for customers, user_id for agents'
    },
    client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'clients',
            key: "id"
        }
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    sender_type: {
        type: DataTypes.ENUM('customer', 'ai', 'agent', 'system'),
        defaultValue: 'customer'
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '{"intent": "...", "entities": {...}, "rag_used": true}'
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'messages',
    timestamps: false,
    indexes: [
        { fields: ['room_id'] },
        { fields: ['client_id'] },
        { fields: ['created_at'] },
        { fields: ['room_id', 'created_at'] }
    ]
});

export default Message;