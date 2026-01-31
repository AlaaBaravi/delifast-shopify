/**
 * Background Jobs Service
 * Handles scheduled tasks for status sync, temp ID resolution, and pending orders
 */

import prisma from "../db.server";
import { logger } from "./logger.server";
import { delifastClient } from "./delifastClient.server";
import { config } from "./config.server";
import { isTemporaryId } from "../utils/statusMapping";

/**
 * Sync shipment statuses for all stores
 * Should be run hourly via external cron
 */
export async function syncAllStatuses() {
  logger.info('Starting status sync for all stores');

  const stores = await prisma.storeSettings.findMany({
    where: {
      delifastUsername: { not: null },
      delifastPassword: { not: null },
    },
    select: { shop: true },
  });

  let totalSynced = 0;
  let totalFailed = 0;

  for (const store of stores) {
    try {
      const result = await syncStoreStatuses(store.shop);
      totalSynced += result.synced;
      totalFailed += result.failed;
    } catch (error) {
      logger.error('Failed to sync store', {
        shop: store.shop,
        error: error.message
      });
    }
  }

  logger.info('Status sync completed', { totalSynced, totalFailed, stores: stores.length });

  return { totalSynced, totalFailed, storesProcessed: stores.length };
}

/**
 * Sync shipment statuses for a single store
 * @param {string} shop - Shop domain
 */
export async function syncStoreStatuses(shop) {
  logger.info('Syncing statuses for store', null, shop);

  // Get active shipments (not completed, cancelled, returned, or error)
  const shipments = await prisma.shipment.findMany({
    where: {
      shop,
      isTemporaryId: false,
      status: { notIn: ['completed', 'cancelled', 'returned', 'error'] },
      shipmentId: { not: null },
    },
  });

  if (shipments.length === 0) {
    logger.debug('No shipments to sync', null, shop);
    return { synced: 0, failed: 0 };
  }

  logger.info(`Found ${shipments.length} shipments to check`, null, shop);

  let synced = 0;
  let failed = 0;

  for (const shipment of shipments) {
    try {
      const statusResult = await delifastClient.getShipmentStatus(shop, shipment.shipmentId);

      if (statusResult.success && statusResult.status !== shipment.status) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            status: statusResult.status,
            statusDetails: statusResult.statusDetails,
            updatedAt: new Date(),
          },
        });

        logger.info('Status updated', {
          orderId: shipment.shopifyOrderId,
          oldStatus: shipment.status,
          newStatus: statusResult.status,
        }, shop);

        synced++;
      }
    } catch (error) {
      logger.error('Failed to sync shipment status', {
        orderId: shipment.shopifyOrderId,
        error: error.message,
      }, shop);
      failed++;
    }
  }

  logger.info('Store sync completed', { synced, failed }, shop);
  return { synced, failed };
}

/**
 * Update temporary IDs for all stores
 * Should be run hourly via external cron
 */
export async function updateAllTempIds() {
  logger.info('Starting temp ID update for all stores');

  const stores = await prisma.storeSettings.findMany({
    where: {
      delifastUsername: { not: null },
      delifastPassword: { not: null },
    },
    select: { shop: true },
  });

  let totalUpdated = 0;
  let totalFailed = 0;

  for (const store of stores) {
    try {
      const result = await updateStoreTempIds(store.shop);
      totalUpdated += result.updated;
      totalFailed += result.failed;
    } catch (error) {
      logger.error('Failed to update temp IDs for store', {
        shop: store.shop,
        error: error.message
      });
    }
  }

  logger.info('Temp ID update completed', { totalUpdated, totalFailed, stores: stores.length });

  return { totalUpdated, totalFailed, storesProcessed: stores.length };
}

/**
 * Update temporary IDs for a single store
 * @param {string} shop - Shop domain
 */
export async function updateStoreTempIds(shop) {
  logger.info('Updating temp IDs for store', null, shop);

  // Get shipments with temporary IDs that haven't exceeded max attempts
  const shipments = await prisma.shipment.findMany({
    where: {
      shop,
      isTemporaryId: true,
      lookupAttempts: { lt: config.jobs.maxLookupAttempts },
      OR: [
        { nextLookupAt: null },
        { nextLookupAt: { lte: new Date() } },
      ],
    },
  });

  if (shipments.length === 0) {
    logger.debug('No temporary IDs to update', null, shop);
    return { updated: 0, failed: 0 };
  }

  logger.info(`Found ${shipments.length} shipments with temporary IDs`, null, shop);

  let updated = 0;
  let failed = 0;

  for (const shipment of shipments) {
    try {
      // Lookup real shipment ID by order number
      const realShipmentId = await delifastClient.lookupByOrderNumber(
        shop,
        shipment.shopifyOrderNumber
      );

      if (realShipmentId && !isTemporaryId(realShipmentId)) {
        // Found real ID
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            shipmentId: realShipmentId,
            isTemporaryId: false,
            lookupAttempts: shipment.lookupAttempts + 1,
            lastLookupAt: new Date(),
            nextLookupAt: null,
          },
        });

        logger.info('Found real shipment ID', {
          orderId: shipment.shopifyOrderId,
          oldId: shipment.shipmentId,
          newId: realShipmentId,
        }, shop);

        updated++;
      } else {
        // Not found, schedule next lookup
        const nextLookup = new Date(Date.now() + config.jobs.lookupIntervalMinutes * 60 * 1000);

        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            lookupAttempts: shipment.lookupAttempts + 1,
            lastLookupAt: new Date(),
            nextLookupAt: nextLookup,
          },
        });

        logger.debug('Shipment ID not found, scheduling retry', {
          orderId: shipment.shopifyOrderId,
          attempts: shipment.lookupAttempts + 1,
          nextLookup,
        }, shop);

        failed++;
      }
    } catch (error) {
      logger.error('Failed to lookup shipment ID', {
        orderId: shipment.shopifyOrderId,
        error: error.message,
      }, shop);
      failed++;
    }
  }

  logger.info('Temp ID update completed', { updated, failed }, shop);
  return { updated, failed };
}

/**
 * Check for pending/stuck orders for all stores
 * Should be run every 4 hours via external cron
 */
export async function checkAllPendingOrders() {
  logger.info('Starting pending orders check for all stores');

  const stores = await prisma.storeSettings.findMany({
    where: {
      delifastUsername: { not: null },
      delifastPassword: { not: null },
    },
    select: { shop: true },
  });

  let totalFound = 0;

  for (const store of stores) {
    try {
      const result = await checkStorePendingOrders(store.shop);
      totalFound += result.found;
    } catch (error) {
      logger.error('Failed to check pending orders for store', {
        shop: store.shop,
        error: error.message
      });
    }
  }

  logger.info('Pending orders check completed', { totalFound, stores: stores.length });

  return { totalFound, storesProcessed: stores.length };
}

/**
 * Check for pending/stuck orders for a single store
 * @param {string} shop - Shop domain
 */
export async function checkStorePendingOrders(shop) {
  logger.info('Checking pending orders for store', null, shop);

  // Find shipments that are stuck (sent > 24 hours ago, still 'new' status)
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stuckShipments = await prisma.shipment.findMany({
    where: {
      shop,
      status: 'new',
      isTemporaryId: true,
      sentAt: { lt: cutoffDate },
      lookupAttempts: { gte: config.jobs.maxLookupAttempts },
    },
  });

  if (stuckShipments.length === 0) {
    logger.debug('No stuck pending orders found', null, shop);
    return { found: 0 };
  }

  logger.warning(`Found ${stuckShipments.length} stuck pending orders`, null, shop);

  // Mark them with an error status so they appear in the UI
  for (const shipment of stuckShipments) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'error',
        statusDetails: 'Unable to find real shipment ID after maximum attempts. Please update manually.',
      },
    });

    logger.warning('Marked shipment as stuck', {
      orderId: shipment.shopifyOrderId,
      attempts: shipment.lookupAttempts,
    }, shop);
  }

  return { found: stuckShipments.length };
}
