/**
 * Status Sync Job
 * Periodically syncs shipment statuses from Delifast
 * Mirrors the logic from WooCommerce's status-sync.php delifast_do_sync_shipment_statuses
 */

import { prisma } from '../config/database.js';
import { logger } from '../services/logger.js';
import { delifastClient } from '../services/delifastClient.js';
import { getShopifyTag, isTemporaryId } from '../utils/statusMapping.js';
import { updateOrderMetafields, addOrderTags } from '../config/shopify.js';
import { config } from '../config/index.js';

/**
 * Sync shipment statuses for all stores
 */
export async function syncShipmentStatuses() {
  logger.info('Starting shipment status synchronization');

  // Get all stores with configured Delifast credentials
  const stores = await prisma.storeSettings.findMany({
    where: {
      delifastUsername: { not: null },
      delifastPassword: { not: null },
    },
    select: {
      shopDomain: true,
    },
  });

  logger.info(`Found ${stores.length} stores to sync`);

  for (const store of stores) {
    try {
      await syncStoreStatuses(store.shopDomain);
    } catch (error) {
      logger.error('Failed to sync store', { 
        shopDomain: store.shopDomain, 
        error: error.message 
      });
    }
  }

  logger.info('Completed shipment status synchronization');
}

/**
 * Sync statuses for a single store
 * @param {string} shopDomain - Shop domain
 */
async function syncStoreStatuses(shopDomain) {
  logger.info('Syncing statuses for store', null, shopDomain);

  // Get shipments that need status update
  // Exclude: temporary IDs, completed/cancelled/returned (final states)
  const shipments = await prisma.shipment.findMany({
    where: {
      shopDomain,
      isTemporaryId: false,
      shipmentId: { not: null },
      status: {
        notIn: ['completed', 'cancelled', 'returned', 'not_found'],
      },
    },
    take: 100, // Process in batches
  });

  if (shipments.length === 0) {
    logger.debug('No shipments to sync', null, shopDomain);
    return;
  }

  logger.info(`Found ${shipments.length} shipments to check`, null, shopDomain);

  let updated = 0;
  let errors = 0;

  for (const shipment of shipments) {
    try {
      // Skip temporary IDs (double check)
      if (isTemporaryId(shipment.shipmentId)) {
        continue;
      }

      // Get status from Delifast
      const statusResult = await delifastClient.getShipmentStatus(
        shopDomain, 
        shipment.shipmentId
      );

      // Check if status changed
      if (statusResult.status !== shipment.status) {
        // Update local record
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            status: statusResult.status,
            statusDetails: statusResult.statusDetails,
          },
        });

        // Update Shopify order
        try {
          const accessToken = config.shopify.accessToken;
          
          if (accessToken) {
            await updateOrderMetafields(
              shopDomain, 
              accessToken, 
              `gid://shopify/Order/${shipment.shopifyOrderId}`,
              {
                status: statusResult.status,
                status_details: statusResult.statusDetails || '',
              }
            );

            await addOrderTags(
              shopDomain, 
              accessToken, 
              `gid://shopify/Order/${shipment.shopifyOrderId}`,
              [getShopifyTag(statusResult.status)]
            );
          }
        } catch (shopifyError) {
          logger.warning('Failed to update Shopify order', { 
            orderId: shipment.shopifyOrderId,
            error: shopifyError.message 
          }, shopDomain);
        }

        logger.info('Status updated', { 
          orderId: shipment.shopifyOrderId, 
          oldStatus: shipment.status, 
          newStatus: statusResult.status 
        }, shopDomain);

        updated++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      logger.error('Failed to check shipment status', { 
        shipmentId: shipment.shipmentId, 
        error: error.message 
      }, shopDomain);
      errors++;
    }
  }

  logger.info('Status sync completed for store', { 
    updated, 
    errors, 
    total: shipments.length 
  }, shopDomain);
}
