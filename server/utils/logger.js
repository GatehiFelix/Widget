import { config } from "../config/index.js";

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Format a log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted message
 */
const formatMessage = (level, message) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return `${prefix} ${message}`;
};

/**
 * Get current log level from config
 * @returns {number} Current log level
 */
const getCurrentLevel = () => {
  return LOG_LEVELS[config.app.logLevel] || LOG_LEVELS.info;
};

/**
 * Log an error message
 * @param {string} message - Error message
 * @param  {...any} args - Additional arguments
 */
const error = (message, ...args) => {
  if (getCurrentLevel() >= LOG_LEVELS.error) {
    console.error(formatMessage('error', message), ...args);
  }
};

/**
 * Log a warning message
 * @param {string} message - Warning message
 * @param  {...any} args - Additional arguments
 */
const warn = (message, ...args) => {
  if (getCurrentLevel() >= LOG_LEVELS.warn) {
    console.warn(formatMessage('warn', message), ...args);
  }
};

/**
 * Log an info message
 * @param {string} message - Info message
 * @param  {...any} args - Additional arguments
 */
const info = (message, ...args) => {
  if (getCurrentLevel() >= LOG_LEVELS.info) {
    console.log(formatMessage('info', message), ...args);
  }
};

/**
 * Log a debug message
 * @param {string} message - Debug message
 * @param  {...any} args - Additional arguments
 */
const debug = (message, ...args) => {
  if (getCurrentLevel() >= LOG_LEVELS.debug) {
    console.log(formatMessage('debug', message), ...args);
  }
};

export default {
  error,
  warn,
  info,
  debug,
};
