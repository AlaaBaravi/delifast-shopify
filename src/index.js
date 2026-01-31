/**
 * Delifast Shopify App - Main Entry Point
 * 
 * This app integrates Shopify stores with Delifast delivery system,
 * replicating all features from the WooCommerce Delifast plugin.
 */

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { logger } from './services/logger.js';
import { webhookRoutes } from './routes/webhooks.js';
import { apiRoutes } from './routes/api.js';
import { settingsRoutes } from './routes/settings.js';
import { syncShipmentStatuses } from './jobs/syncStatuses.js';
import { updateTemporaryIds } from './jobs/updateTempIds.js';
import { checkPendingOrders } from './jobs/checkPending.js';
import { prisma } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());

// Raw body for webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON body for other routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'delifast-shopify',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/settings', settingsRoutes);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../web/frontend')));

// Serve frontend for all non-API routes (SPA support)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path 
  });
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.isDev ? err.message : undefined
  });
});

// Schedule background jobs
function scheduleJobs() {
  // Sync shipment statuses every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly status sync job');
    try {
      await syncShipmentStatuses();
    } catch (error) {
      logger.error('Status sync job failed', { error: error.message });
    }
  });

  // Update temporary IDs every hour
  cron.schedule('30 * * * *', async () => {
    logger.info('Running hourly temp ID update job');
    try {
      await updateTemporaryIds();
    } catch (error) {
      logger.error('Temp ID update job failed', { error: error.message });
    }
  });

  // Check pending orders every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Running pending orders check job');
    try {
      await checkPendingOrders();
    } catch (error) {
      logger.error('Pending orders check job failed', { error: error.message });
    }
  });

  logger.info('Background jobs scheduled');
}

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Schedule background jobs
    scheduleJobs();

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`Delifast Shopify app running on port ${config.port}`);
      logger.info(`Environment: ${config.isDev ? 'development' : 'production'}`);
    });
  } catch (error) {
    logger.error('Failed to start app', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

start();
