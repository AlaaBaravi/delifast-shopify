/**
 * Logging Service
 * Structured logging with database persistence per store
 */

import prisma from "../db.server";
import { config } from "./config.server";

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
  async logToDatabase(shop, level, message, context) {
    if (!shop) return;

    try {
      // Ensure store settings exist
      await prisma.storeSettings.upsert({
        where: { shop },
        create: { shop },
        update: {},
      });

      await prisma.log.create({
        data: {
          shop,
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
  async log(level, message, context = null, shop = null) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    // Always log to console
    this.logToConsole(level, message, context);

    // Log to database if shop provided
    if (shop) {
      await this.logToDatabase(shop, level, message, context);
    }
  }

  /**
   * Convenience methods
   */
  debug(message, context = null, shop = null) {
    return this.log('debug', message, context, shop);
  }

  info(message, context = null, shop = null) {
    return this.log('info', message, context, shop);
  }

  warning(message, context = null, shop = null) {
    return this.log('warning', message, context, shop);
  }

  error(message, context = null, shop = null) {
    return this.log('error', message, context, shop);
  }

  /**
   * Get logs from database
   */
  async getLogs(shop, options = {}) {
    const { level, limit = 100, offset = 0 } = options;

    const where = { shop };
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
   * Get log count
   */
  async getLogCount(shop, level = null) {
    const where = { shop };
    if (level) {
      where.level = level;
    }
    return prisma.log.count({ where });
  }

  /**
   * Clear old logs (keep last 7 days)
   */
  async clearOldLogs(shop, daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.log.deleteMany({
      where: {
        shop,
        createdAt: { lt: cutoffDate },
      },
    });

    this.info(`Cleared ${result.count} old logs`, { daysToKeep }, shop);
    return result.count;
  }
}

export const logger = new Logger();
