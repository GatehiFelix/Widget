import logger from './logger.js';

/**
 * Performance tracking utility for measuring operation timings
 */
export class PerformanceTracker {
  constructor(operationName) {
    this.operationName = operationName;
    this.timings = {};
    this.startTime = Date.now();
  }

  /**
   * Mark a timing checkpoint
   * @param {string} label - Label for this checkpoint
   */
  mark(label) {
    this.timings[label] = Date.now();
  }

  /**
   * Get duration between checkpoints
   * @param {string} label - Label to get duration for
   * @returns {string|null} Duration in seconds
   */
  getDuration(label) {
    if (!this.timings[label]) return null;
    const previousKey = Object.keys(this.timings)[Object.keys(this.timings).indexOf(label) - 1];
    const previousTime = previousKey ? this.timings[previousKey] : this.startTime;
    return ((this.timings[label] - previousTime) / 1000).toFixed(2);
  }

  /**
   * Get total duration since tracker creation
   * @returns {string} Total duration in seconds
   */
  getTotalDuration() {
    return ((Date.now() - this.startTime) / 1000).toFixed(2);
  }

  /**
   * Print performance summary
   * @returns {Object} Performance data
   */
  summary() {
    const total = this.getTotalDuration();
    
    logger.info(`\n📊 Performance Summary: ${this.operationName}`);
    logger.info('='.repeat(50));
    
    Object.keys(this.timings).forEach(label => {
      logger.info(`   ${label.padEnd(25)} ${this.getDuration(label)}s`);
    });
    
    logger.info('   ' + '─'.repeat(48));
    logger.info(`   ${'TOTAL'.padEnd(25)} ${total}s`);
    logger.info('='.repeat(50) + '\n');
    
    return { 
      operation: this.operationName,
      timings: this.timings, 
      total,
      breakdown: Object.keys(this.timings).reduce((acc, label) => {
        acc[label] = this.getDuration(label);
        return acc;
      }, {})
    };
  }

  /**
   * Get performance data without logging
   * @returns {Object} Performance data
   */
  getData() {
    return {
      operation: this.operationName,
      total: this.getTotalDuration(),
      breakdown: Object.keys(this.timings).reduce((acc, label) => {
        acc[label] = this.getDuration(label);
        return acc;
      }, {})
    };
  }
}

export default PerformanceTracker;