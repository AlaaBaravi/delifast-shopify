/**
 * Temporary ID Update Job
 * Resolves temporary shipment IDs to real ones
 * Mirrors the logic from WooCommerce's status-sync.php delifast_update_temporary_ids
 */

import { prisma } from '../config/database.js';
import { logger } from '../services/logger.js';
import { delifastClient } from '../services/delifastClient.js';
import { config } from '../config/index.js';
import { updateOrderMetafields } from '../config/shopify.js';

/**
 * Update temporary shipment IDs for all stores
 */
export async function updateTemporaryIds() {
  logger.info('Starting temporary ID update process');

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

  for (const store of stores) {
    try {
      await updateStoreTempIds(store.shopDomain);
    } catch (error) {
      logger.error('Failed to update temp IDs for store', { 
        shopDomain: store.shopDomain, 
        error: error.message 
      });
    }
  }

  logger.info('Completed temporary ID update process');
}

/**
 * Update temporary IDs for a single store
 * @param {string} shopDomain - Shop domain
 */
async function updateStoreTempIds(shopDomain) {
  logger.info('Updating temp IDs for store', null, shopDomain);

  // Get shipments with temporary IDs that are due for lookup
  const shipments = await prisma.shipment.findMany({
    where: {
      shopDomain,
      isTemporaryId: true,
      lookupAttempts: { lt: config.jobs.maxLookupAttempts },
      OR: [
        { nextLookupAt: null },
        { nextLookupAt: { lte: new Date() } },
      ],
    },
    take: 50,
  });

  if (shipments.length === 0) {
    logger.debug('No temporary IDs to update', null, shopDomain);
    return;
  }

  logger.info(`Found ${shipments.length} shipments with temporary IDs`, null, shopDomain);

  let resolved = 0;
  let failed = 0;

  for (const shipment of shipments) {
    try {
      // Lookup real shipment ID by order number
      const realShipmentId = await delifastClient.lookupByOrderNumber(
        shopDomain,
        shipment.shopifyOrderNumber
      );

      if (realShipmentId && realShipmentId !== shipment.shipmentId) {
        // Found real ID - update record
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            shipmentId: realShipmentId,
            isTemporaryId: false,
            status: 'new', // Reset to be synced
            statusDetails: 'Real shipment ID received',
            lookupAttempts: 0,
            nextLookupAt: null,
            lastLookupAt: new Date(),
          },
        });

        // Update Shopify metafields
        try {
          const accessToken = config.shopify.accessToken;
          
          if (accessToken) {
            await updateOrderMetafields(
              shopDomain, 
              accessToken, 
              `gid://shopify/Order/${shipment.shopifyOrderId}`,
              {
                shipment_id: realShipmentId,
                is_temporary: 'false',
              }
            );
          }
        } catch (shopifyError) {
          logger.warning('Failed to update Shopify metafields', { 
            orderId: shipment.shopifyOrderId,
            error: shopifyError.message 
          }, shopDomain);
        }

        logger.info('Resolved temporary ID', { 
          orderId: shipment.shopifyOrderId, 
          tempId: shipment.shipmentId,
          realId: realShipmentId 
        }, shopDomain);

        resolved++;

      } else {
        // Not found - schedule next lookup
        const nextAttempt = shipment.lookupAttempts + 1;
        const nextLookupAt = new Date(
          Date.now() + config.jobs.lookupIntervalMinutes * 60 * 1000
        );

        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            lookupAttempts: nextAttempt,
            lastLookupAt: new Date(),
            nextLookupAt: nextAttempt < config.jobs.maxLookupAttempts ? nextLookupAt : null,
          },
        });

        if (nextAttempt >= config.jobs.maxLookupAttempts) {
          logger.warning('Max lookup attempts reached', { 
            orderId: shipment.shopifyOrderId,
            attempts: nextAttempt 
          }, shopDomain);
          
          // Update status to indicate manual intervention needed
          await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
              statusDetails: 'Could not retrieve real shipment ID. Please update manually.',
            },
          });
        }

        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      logger.error('Failed to lookup shipment', { 
        orderId: shipment.shopifyOrderId, 
        error: error.message 
      }, shopDomain);
      failed++;
    }
  }

  logger.info('Temp ID update completed for store', { 
    resolved, 
    failed, 
    total: shipments.length 
  }, shopDomain);
}
