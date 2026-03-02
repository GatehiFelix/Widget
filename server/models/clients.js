import { DataTypes } from "sequelize";
import connectDB from "../config/db.js";

const sequelize = await connectDB();

const Client = sequelize.define(
  "Client",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "Reference ID from the CRM system",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Business name e.g. Prime Realty Inc",
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    website_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    industry: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "e.g. banking, healthcare, retail",
    },
    plan: {
      type: DataTypes.ENUM("free", "starter", "pro", "enterprise"),
      defaultValue: "free",
    },
    max_concurrent_chats: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
    },
    monthly_conversation_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "null = unlimited",
    },
    conversations_this_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Reset monthly via cron",
    },
    zuridesk_api_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    client_db_connection: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Enterprise only — isolated DB config",
    },
    rag_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowed_origins: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Allowed domains for CORS e.g. ['https://client.com']",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    last_active_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "clients",
    timestamps: false,
    hooks: {
      beforeUpdate: (client) => {
        client.updated_at = new Date();
      },
    },
  }
);

export default Client;