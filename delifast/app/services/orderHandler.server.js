/**
 * Order Handler Service
 * Handles order events and Delifast integration
 */

import prisma from "../db.server";
import { logger } from "./logger.server";
import { delifastClient } from "./delifastClient.server";
import { prepareOrderDataForDelifast, shouldAutoSend } from "./orderMapper.server";
import {
  getShopifyTag,
  generateTemporaryId,
  isTemporaryId
} from "../utils/statusMapping";

/**
 * Handle order created webhook
 * @param {string} shop - Shop domain
 * @param {Object} order - Shopify order data
 * @param {Object} admin - Shopify Admin API client
 */
export async function handleOrderCreated(shop, order, admin) {
  logger.info('Processing order created', {
    orderId: order.id,
    orderNumber: order.name
  }, shop);

  // Check if should auto-send on create
  if (await shouldAutoSend(shop, order, 'created')) {
    await sendOrderToDelifast(shop, order, admin);
  }
}

/**
 * Handle order paid webhook
 * @param {string} shop - Shop domain
 * @param {Object} order - Shopify order data
 * @param {Object} admin - Shopify Admin API client
 */
export async function handleOrderPaid(shop, order, admin) {
  logger.info('Processing order paid', {
    orderId: order.id,
    orderNumber: order.name
  }, shop);

  // Check if already sent
  const existing = await prisma.shipment.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId: String(order.id),
      },
    },
  });

  if (existing?.shipmentId) {
    logger.debug('Order already sent to Delifast', {
      orderId: order.id,
      shipmentId: existing.shipmentId
    }, shop);
    return;
  }

  // Check if should auto-send on paid
  if (await shouldAutoSend(shop, order, 'paid')) {
    await sendOrderToDelifast(shop, order, admin);
  }
}

/**
 * Handle order updated webhook
 * @param {string} shop - Shop domain
 * @param {Object} order - Shopify order data
 */
export async function handleOrderUpdated(shop, order) {
  // Currently we don't need to do anything specific on update
  // Status sync is handled by the scheduled job
  logger.debug('Order updated', { orderId: order.id }, shop);
}

/**
 * Send order to Delifast
 * @param {string} shop - Shop domain
 * @param {Object} order - Shopify order data
 * @param {Object} admin - Shopify Admin API client (optional)
 * @returns {Object} Result with shipmentId
 */
export async function sendOrderToDelifast(shop, order, admin = null) {
  const orderId = String(order.id);
  const orderNumber = order.order_number || order.name || orderId;

  logger.info('Sending order to Delifast', { orderId, orderNumber }, shop);

  try {
    // Prepare order data
    const orderData = await prepareOrderDataForDelifast(shop, order);

    // Create shipment
    const result = await delifastClient.createShipment(shop, orderData);

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
        shop_shopifyOrderId: {
          shop,
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
        shop,
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
    if (admin) {
      try {
        // Add metafields
        await admin.graphql(
          `#graphql
          mutation updateOrderMetafields($input: OrderInput!) {
            orderUpdate(input: $input) {
              order { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              input: {
                id: `gid://shopify/Order/${orderId}`,
                metafields: [
                  {
                    namespace: 'delifast',
                    key: 'shipment_id',
                    value: shipmentId,
                    type: 'single_line_text_field',
                  },
                  {
                    namespace: 'delifast',
                    key: 'status',
                    value: 'new',
                    type: 'single_line_text_field',
                  },
                  {
                    namespace: 'delifast',
                    key: 'is_temporary',
                    value: String(isTemporary),
                    type: 'single_line_text_field',
                  },
                ],
              },
            },
          }
        );

        // Add tags
        await admin.graphql(
          `#graphql
          mutation addOrderTags($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              node { ... on Order { id tags } }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: `gid://shopify/Order/${orderId}`,
              tags: [getShopifyTag('new'), 'delifast-sent'],
            },
          }
        );

        logger.debug('Updated Shopify order', { orderId }, shop);
      } catch (shopifyError) {
        // Don't fail the whole operation if Shopify update fails
        logger.warning('Failed to update Shopify order', {
          error: shopifyError.message,
          orderId
        }, shop);
      }
    }

    logger.info('Order sent to Delifast successfully', {
      orderId,
      shipmentId,
      isTemporary
    }, shop);

    return {
      success: true,
      shipmentId,
      isTemporary,
    };

  } catch (error) {
    logger.error('Failed to send order to Delifast', {
      orderId,
      error: error.message
    }, shop);

    // Save error state
    await prisma.shipment.upsert({
      where: {
        shop_shopifyOrderId: {
          shop,
          shopifyOrderId: orderId,
        },
      },
      update: {
        status: 'error',
        statusDetails: error.message,
      },
      create: {
        shop,
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
 * @param {string} shop - Shop domain
 * @param {string} shopifyOrderId - Shopify order ID
 * @param {Object} admin - Shopify Admin API client (optional)
 * @returns {Object} Updated status info
 */
export async function refreshOrderStatus(shop, shopifyOrderId, admin = null) {
  const shipment = await prisma.shipment.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
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
    }, shop);

    return {
      status: 'new',
      statusDetails: 'This is a temporary ID. Please update with real shipment ID.',
      isTemporary: true,
    };
  }

  // Get status from Delifast
  const statusResult = await delifastClient.getShipmentStatus(shop, shipment.shipmentId);

  // Update local record
  await prisma.shipment.update({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId,
      },
    },
    data: {
      status: statusResult.status,
      statusDetails: statusResult.statusDetails,
    },
  });

  // Update Shopify order
  if (admin) {
    try {
      await admin.graphql(
        `#graphql
        mutation updateOrderMetafields($input: OrderInput!) {
          orderUpdate(input: $input) {
            order { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              id: `gid://shopify/Order/${shopifyOrderId}`,
              metafields: [
                {
                  namespace: 'delifast',
                  key: 'status',
                  value: statusResult.status,
                  type: 'single_line_text_field',
                },
                {
                  namespace: 'delifast',
                  key: 'status_details',
                  value: statusResult.statusDetails || '',
                  type: 'single_line_text_field',
                },
              ],
            },
          },
        }
      );

      await admin.graphql(
        `#graphql
        mutation addOrderTags($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            node { ... on Order { id } }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: `gid://shopify/Order/${shopifyOrderId}`,
            tags: [getShopifyTag(statusResult.status)],
          },
        }
      );
    } catch (shopifyError) {
      logger.warning('Failed to update Shopify order status', {
        error: shopifyError.message
      }, shop);
    }
  }

  logger.info('Status refreshed', {
    orderId: shopifyOrderId,
    status: statusResult.status
  }, shop);

  return statusResult;
}

/**
 * Update shipment ID (replace temporary with real)
 * @param {string} shop - Shop domain
 * @param {string} shopifyOrderId - Shopify order ID
 * @param {string} newShipmentId - New shipment ID
 * @param {Object} admin - Shopify Admin API client (optional)
 */
export async function updateShipmentId(shop, shopifyOrderId, newShipmentId, admin = null) {
  const shipment = await prisma.shipment.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
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
      shop_shopifyOrderId: {
        shop,
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
  }, shop);

  // Update Shopify metafields
  if (admin) {
    try {
      await admin.graphql(
        `#graphql
        mutation updateOrderMetafields($input: OrderInput!) {
          orderUpdate(input: $input) {
            order { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              id: `gid://shopify/Order/${shopifyOrderId}`,
              metafields: [
                {
                  namespace: 'delifast',
                  key: 'shipment_id',
                  value: newShipmentId,
                  type: 'single_line_text_field',
                },
                {
                  namespace: 'delifast',
                  key: 'is_temporary',
                  value: 'false',
                  type: 'single_line_text_field',
                },
              ],
            },
          },
        }
      );
    } catch (shopifyError) {
      logger.warning('Failed to update Shopify metafields', {
        error: shopifyError.message
      }, shop);
    }
  }

  // Refresh status with new ID
  return refreshOrderStatus(shop, shopifyOrderId, admin);
}

/**
 * Get shipment by order ID
 * @param {string} shop - Shop domain
 * @param {string} shopifyOrderId - Shopify order ID
 * @returns {Object|null} Shipment record
 */
export async function getShipment(shop, shopifyOrderId) {
  return prisma.shipment.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId,
      },
    },
  });
}

/**
 * Get all shipments for a store
 * @param {string} shop - Shop domain
 * @param {Object} options - Query options
 * @returns {Object} Shipments and count
 */
export async function getShipments(shop, options = {}) {
  const { status, limit = 50, offset = 0 } = options;

  const where = { shop };
  if (status) {
    where.status = status;
  }

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.shipment.count({ where }),
  ]);

  return { shipments, total };
}
