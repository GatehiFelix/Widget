-- Migration: Add agent_source column to chat_rooms table
-- This tracks whether an assigned agent is from the local or external database

ALTER TABLE chat_rooms 
ADD COLUMN agent_source ENUM('local', 'external') NULL 
COMMENT 'Source of the assigned agent (local or external database)'
AFTER assigned_agent_id;
