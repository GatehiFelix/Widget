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
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
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
    },
     widget_primary_color: {
      type: DataTypes.STRING,
      defaultValue: "#6366f1",
    },
    widget_position: {
      type: DataTypes.ENUM("bottom-right", "bottom-left"),
      defaultValue: "bottom-right",
    },
    widget_welcome_message: {
      type: DataTypes.TEXT,
    },
    widget_launcher_text: {
      type: DataTypes.STRING,
      defaultValue: "Chat with us",
    },
    widget_salt: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "HMAC salt — rotate this to invalidate old widget keys",
    },
    widget_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Kill switch — set false to disable widget for this client",
    },
    widget_activated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the client first embedded and activated their widget",
    },
    max_concurrent_chats: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: "Max simultaneous active conversations allowed",
    },
    monthly_conversation_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "null = unlimited. Set per billing plan.",
    },
    conversations_this_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Reset monthly via cron job",
    },
    plan: {
      type: DataTypes.ENUM("free", "starter", "pro", "enterprise"),
      defaultValue: "free",
    },
    zuridesk_api_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    client_db_connection: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    allowed_origins: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of allowed domains for CORS. e.g. ['https://client.com']",
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
      comment: "Last time any widget session was started for this client",
    },
  },
  {
    tableName: "clients",
    timestamps: false,
    hooks: {
      beforeUpdate: (client) => {
        client.updated_at = new Date();
      }
    }
  },
);

export default Client;
