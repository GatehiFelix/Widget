import { DataTypes } from "sequelize";

import connectDB from "#config/db.js";

const sequelize = await connectDB();

const RefreshToken = sequelize.define("RefreshToken", {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    token: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
    },
    session_id: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    tenant_id: {
    type: DataTypes.BIGINT,  
    allowNull: false,
    references: {
        model: 'clients',
        key: 'id'
    }
},
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
}, {
    tableName: 'refresh_tokens',
    timestamps: false,
    indexes: [
        { fields: ['session_id'] },
        { fields: ['tenant_id'] },
    ]
})

export default RefreshToken;