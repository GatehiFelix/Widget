import { DataTypes } from 'sequelize';
import connectDB from '../config/db.js';

const sequelize = await connectDB();

const User = sequelize.define('User', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
    },
    client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'clients',
            key: 'id'
        },
        comment: 'Which client/tenant this user belongs to'
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    role: {
        type: DataTypes.ENUM('agent', 'admin', 'support', 'customer'),
        defaultValue: 'agent',
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('online', 'offline', 'busy', 'away'),
        defaultValue: 'offline'
    },
    max_concurrent_chats: {
        type: DataTypes.INTEGER,
        defaultValue: 5
    },
    current_chat_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    last_seen_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'users',
    timestamps: false,
    indexes: [
        { fields: ['client_id', 'email'], unique: true },
        { fields: ['client_id', 'role'] },
        { fields: ['status'] }
    ]
});

export default User;
