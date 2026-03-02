import { DataTypes } from "sequelize";
import connectDB from "../config/db.js";

const sequelize = await connectDB();

const WidgetConfig = sequelize.define(
  "WidgetConfig",
  {
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
        model: "clients",
        key: "id",
      },
      onDelete: "CASCADE",
      comment: "FK → clients.id",
    }, 
    widget_name: {
        type: DataTypes.STRING,
        allowNull: true,
    }, 
    primary_color: {
      type: DataTypes.STRING,
      defaultValue: "#3B82F6",
    }, 
    position: {
      type: DataTypes.ENUM("bottom-right", "bottom-left"),
      defaultValue: "bottom-right",
    },
    welcome_message: {
      type: DataTypes.TEXT,
      defaultValue: "Hi there 👋 How can we help you today?",
    },
    launcher_text: {
      type: DataTypes.STRING,
      defaultValue: "Chat with us",
    },
    widget_salt: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "HMAC salt — rotate to invalidate old keys",
    },
    widget_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Kill switch",
    },
    widget_activated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "First time client embedded the widget",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "widget_configs",
    timestamps: false,
    hooks: {
      beforeUpdate: (config) => {
        config.updated_at = new Date();
      },
    },
  }
);

export default WidgetConfig;