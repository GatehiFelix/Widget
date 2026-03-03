import { DataTypes } from "sequelize";
import connectDB from "#config/db.js";

const sequelize = await connectDB();

const ClientDocument = sequelize.define(
  "ClientDocument",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    tenant_id: {
  type: DataTypes.STRING,
  allowNull: false,     
},
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    document_hash: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM("processing", "indexed", "failed"),
      allowNull: false,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    chunk_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    query_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    last_querIED_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    uploaded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    indexed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    job_id: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "client_documents",
    timestamps: true,
    createdAt: "uploaded_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["product_id"] },
      { fields: ["status"] },
      { fields: ["query_count"], order: [["query_count", "DESC"]] },
      { fields: ["uploaded_at"] },
    ],
  },
);

export default ClientDocument;
