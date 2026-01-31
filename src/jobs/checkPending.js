/**
 * Pending Orders Check Job
 * Checks for orders awaiting shipment ID resolution
 * Mirrors the logic from WooCommerce's delifast.php delifast_process_pending_orders
 */

import { prisma } from '../config/database.js';
import { logger } from '../services/logger.js';
import { config } from '../config/index.js';

/**
 * Check pending orders for all stores
 * This job runs every 4 hours to ensure no orders are stuck
 */
export async function checkPendingOrders() {
  logger.info('Starting pending orders check');

  // Get all stores
  const stores = await prisma.storeSettings.findMany({
    where: {
      delifastUsername: { not: null },
      delifastPassword: { not: null },
    },
    select: {
      shopDomain: true,
    },
  });

  for (const store of stores) {
    try {
      await checkStorePendingOrders(store.shopDomain);
    } catch (error) {
      logger.error('Failed to check pending orders for store', { 
        shopDomain: store.shopDomain, 
        error: error.message 
      });
    }
  }

  logger.info('Completed pending orders check');
}

/**
 * Check pending orders for a single store
 * @param {string} shopDomain - Shop domain
 */
async function checkStorePendingOrders(shopDomain) {
  logger.info('Checking pending orders for store', null, shopDomain);

  // Find shipments that:
  // 1. Have temporary IDs
  // 2. Haven't been looked up recently
  // 3. Haven't exceeded max attempts
  const stuckShipments = await prisma.shipment.findMany({
    where: {
      shopDomain,
      isTemporaryId: true,
      lookupAttempts: { lt: config.jobs.maxLookupAttempts },
      OR: [
        // Never looked up
        { lastLookupAt: null, nextLookupAt: null },
        // Lookup scheduled but somehow missed
        { 
          nextLookupAt: { 
            lt: new Date(Date.now() - 2 * 60 * 60 * 1000) // More than 2 hours overdue
          } 
        },
      ],
    },
  });

  if (stuckShipments.length === 0) {
    logger.debug('No stuck pending orders found', null, shopDomain);
    return;
  }

  logger.warning(`Found ${stuckShipments.length} stuck pending orders`, null, shopDomain);

  // Reset these shipments for the temp ID update job to pick up
  for (const shipment of stuckShipments) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        nextLookupAt: new Date(), // Schedule for immediate pickup
      },
    });

    logger.info('Reset stuck shipment for lookup', { 
      orderId: shipment.shopifyOrderId,
      shipmentId: shipment.shipmentId 
    }, shopDomain);
  }

  // Also check for old shipments with errors that might be recoverable
  const errorShipments = await prisma.shipment.findMany({
    where: {
      shopDomain,
      status: 'error',
      createdAt: {
        gt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24 hours
      },
    },
    take: 10,
  });

  if (errorShipments.length > 0) {
    logger.info(`Found ${errorShipments.length} recent error shipments`, null, shopDomain);
    
    // Reset error shipments for retry
    for (const shipment of errorShipments) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'new',
          statusDetails: 'Scheduled for retry after error',
        },
      });
    }
  }

  logger.info('Pending orders check completed for store', { 
    stuck: stuckShipments.length,
    errors: errorShipments.length 
  }, shopDomain);
}

/**
 * Get pending orders summary for a store
 * @param {string} shopDomain - Shop domain
 * @returns {Object} Summary statistics
 */
export async function getPendingOrdersSummary(shopDomain) {
  const totalPending = await prisma.shipment.count({
    where: {
      shopDomain,
      isTemporaryId: true,
    },
  });

  const maxAttemptsReached = await prisma.shipment.count({
    where: {
      shopDomain,
      isTemporaryId: true,
      lookupAttempts: { gte: config.jobs.maxLookupAttempts },
    },
  });

  const errorShipments = await prisma.shipment.count({
    where: {
      shopDomain,
      status: 'error',
    },
  });

  const inTransit = await prisma.shipment.count({
    where: {
      shopDomain,
      status: 'in_transit',
    },
  });

  const completed = await prisma.shipment.count({
    where: {
      shopDomain,
      status: 'completed',
    },
  });

  return {
    totalPending,
    maxAttemptsReached,
    errorShipments,
    inTransit,
    completed,
  };
}
