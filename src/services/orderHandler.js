/**
 * Order Handler Service
 * Handles order events and Delifast integration
 * Mirrors the logic from WooCommerce's enhancements.php and order-actions.php
 */

import { prisma } from '../config/database.js';
import { logger } from './logger.js';
import { delifastClient } from './delifastClient.js';
import { prepareOrderDataForDelifast, shouldAutoSend, extractOrderInfo } from './orderMapper.js';
import { 
  getShopifyTag, 
  extractStatusFromResponse, 
  generateTemporaryId,
  isTemporaryId 
} from '../utils/statusMapping.js';
import { updateOrderMetafields, addOrderTags, addOrderNote } from '../config/shopify.js';
import { config } from '../config/index.js';

/**
 * Handle order created webhook
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order data
 */
export async function handleOrderCreated(shopDomain, order) {
  logger.info('Processing order created', { 
    orderId: order.id, 
    orderNumber: order.name 
  }, shopDomain);

  // Check if should auto-send on create
  if (await shouldAutoSend(shopDomain, order, 'created')) {
    await sendOrderToDelifast(shopDomain, order);
  }
}

/**
 * Handle order paid webhook
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order data
 */
export async function handleOrderPaid(shopDomain, order) {
  logger.info('Processing order paid', { 
    orderId: order.id, 
    orderNumber: order.name 
  }, shopDomain);

  // Check if already sent
  const existing = await prisma.shipment.findUnique({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain,
        shopifyOrderId: String(order.id),
      },
    },
  });

  if (existing?.shipmentId) {
    logger.debug('Order already sent to Delifast', { 
      orderId: order.id, 
      shipmentId: existing.shipmentId 
    }, shopDomain);
    return;
  }

  // Check if should auto-send on paid
  if (await shouldAutoSend(shopDomain, order, 'paid')) {
    await sendOrderToDelifast(shopDomain, order);
  }
}

/**
 * Handle order updated webhook
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order data
 */
export async function handleOrderUpdated(shopDomain, order) {
  // Currently we don't need to do anything specific on update
  // Status sync is handled by the scheduled job
  logger.debug('Order updated', { orderId: order.id }, shopDomain);
}

/**
 * Send order to Delifast
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order data
 * @returns {Object} Result with shipmentId
 */
export async function sendOrderToDelifast(shopDomain, order) {
  const orderId = String(order.id);
  const orderNumber = order.order_number || order.name || orderId;

  logger.info('Sending order to Delifast', { orderId, orderNumber }, shopDomain);

  try {
    // Prepare order data
    const orderData = await prepareOrderDataForDelifast(shopDomain, order);

    // Create shipment
    const result = await delifastClient.createShipment(shopDomain, orderData);

    // Determine shipment ID (real or temporary)
    let shipmentId = result.shipmentId;
    let isTemporary = false;

    if (!shipmentId || result.needsLookup) {
      shipmentId = generateTemporaryId(orderNumber);
      isTemporary = true;
    }

    // Save shipment record
    await prisma.shipment.upsert({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain,
          shopifyOrderId: orderId,
        },
      },
      update: {
        shipmentId,
        isTemporaryId: isTemporary,
        status: 'new',
        statusDetails: isTemporary ? 'Awaiting real shipment ID' : 'Shipment created',
        sentAt: new Date(),
        nextLookupAt: isTemporary ? new Date(Date.now() + 15 * 60 * 1000) : null, // 15 min
      },
      create: {
        shopDomain,
        shopifyOrderId: orderId,
        shopifyOrderNumber: orderNumber,
        shipmentId,
        isTemporaryId: isTemporary,
        status: 'new',
        statusDetails: isTemporary ? 'Awaiting real shipment ID' : 'Shipment created',
        nextLookupAt: isTemporary ? new Date(Date.now() + 15 * 60 * 1000) : null,
      },
    });

    // Update Shopify order with metafields and tags
    const settings = await prisma.storeSettings.findUnique({
      where: { shopDomain },
    });

    if (settings?.delifastUsername) {
      try {
        // Get Shopify access token (from store settings or config)
        const accessToken = config.shopify.accessToken;
        
        if (accessToken) {
          // Update metafields
          await updateOrderMetafields(
            shopDomain, 
            accessToken, 
            `gid://shopify/Order/${orderId}`,
            {
              shipment_id: shipmentId,
              status: 'new',
              is_temporary: String(isTemporary),
            }
          );

          // Add tag
          await addOrderTags(
            shopDomain, 
            accessToken, 
            `gid://shopify/Order/${orderId}`,
            [getShopifyTag('new'), 'delifast-sent']
          );

          logger.debug('Updated Shopify order', { orderId }, shopDomain);
        }
      } catch (shopifyError) {
        // Don't fail the whole operation if Shopify update fails
        logger.warning('Failed to update Shopify order', { 
          error: shopifyError.message, 
          orderId 
        }, shopDomain);
      }
    }

    logger.info('Order sent to Delifast successfully', { 
      orderId, 
      shipmentId, 
      isTemporary 
    }, shopDomain);

    return {
      success: true,
      shipmentId,
      isTemporary,
    };

  } catch (error) {
    logger.error('Failed to send order to Delifast', { 
      orderId, 
      error: error.message 
    }, shopDomain);

    // Save error state
    await prisma.shipment.upsert({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain,
          shopifyOrderId: orderId,
        },
      },
      update: {
        status: 'error',
        statusDetails: error.message,
      },
      create: {
        shopDomain,
        shopifyOrderId: orderId,
        shopifyOrderNumber: orderNumber,
        status: 'error',
        statusDetails: error.message,
      },
    });

    throw error;
  }
}

/**
 * Refresh order status from Delifast
 * @param {string} shopDomain - Shop domain
 * @param {string} shopifyOrderId - Shopify order ID
 * @returns {Object} Updated status info
 */
export async function refreshOrderStatus(shopDomain, shopifyOrderId) {
  const shipment = await prisma.shipment.findUnique({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain,
        shopifyOrderId,
      },
    },
  });

  if (!shipment) {
    throw new Error('Shipment not found');
  }

  // Handle temporary IDs
  if (shipment.isTemporaryId || isTemporaryId(shipment.shipmentId)) {
    logger.debug('Cannot refresh status for temporary ID', { 
      orderId: shopifyOrderId,
      shipmentId: shipment.shipmentId 
    }, shopDomain);

    return {
      status: 'new',
      statusDetails: 'This is a temporary ID. Please update with real shipment ID.',
      isTemporary: true,
    };
  }

  // Get status from Delifast
  const statusResult = await delifastClient.getShipmentStatus(shopDomain, shipment.shipmentId);

  // Update local record
  await prisma.shipment.update({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain,
        shopifyOrderId,
      },
    },
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
        `gid://shopify/Order/${shopifyOrderId}`,
        {
          status: statusResult.status,
          status_details: statusResult.statusDetails || '',
        }
      );

      await addOrderTags(
        shopDomain, 
        accessToken, 
        `gid://shopify/Order/${shopifyOrderId}`,
        [getShopifyTag(statusResult.status)]
      );
    }
  } catch (shopifyError) {
    logger.warning('Failed to update Shopify order status', { 
      error: shopifyError.message 
    }, shopDomain);
  }

  logger.info('Status refreshed', { 
    orderId: shopifyOrderId, 
    status: statusResult.status 
  }, shopDomain);

  return statusResult;
}

/**
 * Update shipment ID (replace temporary with real)
 * @param {string} shopDomain - Shop domain
 * @param {string} shopifyOrderId - Shopify order ID
 * @param {string} newShipmentId - New shipment ID
 */
export async function updateShipmentId(shopDomain, shopifyOrderId, newShipmentId) {
  const shipment = await prisma.shipment.findUnique({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain,
        shopifyOrderId,
      },
    },
  });

  if (!shipment) {
    throw new Error('Shipment not found');
  }

  const oldShipmentId = shipment.shipmentId;

  // Update record
  await prisma.shipment.update({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain,
        shopifyOrderId,
      },
    },
    data: {
      shipmentId: newShipmentId,
      isTemporaryId: false,
      status: 'new', // Reset status to be refreshed
      statusDetails: null,
      lookupAttempts: 0,
      nextLookupAt: null,
    },
  });

  logger.info('Shipment ID updated', { 
    orderId: shopifyOrderId, 
    oldId: oldShipmentId, 
    newId: newShipmentId 
  }, shopDomain);

  // Update Shopify metafields
  try {
    const accessToken = config.shopify.accessToken;
    
    if (accessToken) {
      await updateOrderMetafields(
        shopDomain, 
        accessToken, 
        `gid://shopify/Order/${shopifyOrderId}`,
        {
          shipment_id: newShipmentId,
          is_temporary: 'false',
        }
      );
    }
  } catch (shopifyError) {
    logger.warning('Failed to update Shopify metafields', { 
      error: shopifyError.message 
    }, shopDomain);
  }

  // Refresh status with new ID
  return refreshOrderStatus(shopDomain, shopifyOrderId);
}
