import { DataTypes } from 'sequelize';
import connectDB from '../config/db.js';

const sequelize = await connectDB();

const ChatRoom = sequelize.define('ChatRoom', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'clients',
            key: "id"
        }
    },
    session_token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    widget_visitor_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_external_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
    },
    last_activity_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    zuridesk_ticket_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    assigned_agent_id: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    device_id: {
        type: DataTypes.STRING,
        allowNull: true
    }
},{
    tableName: 'chat_rooms',
    timestamps: false,
    indexes: [
        { fields: ["session_token"]},
        { fields: ["client_id"]},
        { fields: ["status"]}
    ]
});

// Associations defined in models/index.js to avoid circular dependencies

export default ChatRoom;
