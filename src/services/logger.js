/**
 * Logging Service
 * Mirrors the logging functionality from the WooCommerce plugin's logger.php
 */

import { prisma } from '../config/database.js';
import { config } from '../config/index.js';

/**
 * Log levels
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

/**
 * Logger class for structured logging
 */
class Logger {
  constructor() {
    this.minLevel = config.isDev ? LOG_LEVELS.debug : LOG_LEVELS.info;
  }

  /**
   * Format log message for console
   */
  formatConsoleMessage(level, message, context) {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [DELIFAST] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  /**
   * Log to console
   */
  logToConsole(level, message, context) {
    const formattedMessage = this.formatConsoleMessage(level, message, context);
    
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warning':
        console.warn(formattedMessage);
        break;
      case 'debug':
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Log to database
   */
  async logToDatabase(shopDomain, level, message, context) {
    if (!shopDomain) return;

    try {
      await prisma.log.create({
        data: {
          shopDomain,
          level,
          message,
          context: context ? JSON.stringify(context) : null,
        },
      });
    } catch (error) {
      // Don't throw on logging errors, just console log
      console.error('Failed to write log to database:', error.message);
    }
  }

  /**
   * Main log method
   */
  async log(level, message, context = null, shopDomain = null) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    // Always log to console
    this.logToConsole(level, message, context);

    // Log to database if shop domain provided
    if (shopDomain) {
      await this.logToDatabase(shopDomain, level, message, context);
    }
  }

  /**
   * Convenience methods
   */
  debug(message, context = null, shopDomain = null) {
    return this.log('debug', message, context, shopDomain);
  }

  info(message, context = null, shopDomain = null) {
    return this.log('info', message, context, shopDomain);
  }

  warning(message, context = null, shopDomain = null) {
    return this.log('warning', message, context, shopDomain);
  }

  error(message, context = null, shopDomain = null) {
    return this.log('error', message, context, shopDomain);
  }

  /**
   * Get logs from database
   */
  async getLogs(shopDomain, options = {}) {
    const { level, limit = 100, offset = 0 } = options;

    const where = { shopDomain };
    if (level) {
      where.level = level;
    }

    return prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Clear old logs (keep last 7 days)
   */
  async clearOldLogs(shopDomain, daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.log.deleteMany({
      where: {
        shopDomain,
        createdAt: { lt: cutoffDate },
      },
    });

    this.info(`Cleared ${result.count} old logs`, { daysToKeep }, shopDomain);
    return result.count;
  }
}

export const logger = new Logger();
