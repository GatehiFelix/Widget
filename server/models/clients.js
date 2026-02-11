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
    zuridesk_api_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    client_db_connection: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "clients",
    timestamps: false,
  },
);

export default Client;
