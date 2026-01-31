/**
 * Webhook Handler: orders/create
 * Triggered when a new order is created in Shopify
 */

import { authenticate } from "../shopify.server";
import { handleOrderCreated } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  logger.info(`Received ${topic} webhook`, {
    orderId: payload.id,
    orderNumber: payload.name,
  }, shop);

  try {
    // Process the order asynchronously
    await handleOrderCreated(shop, payload, admin);
  } catch (error) {
    logger.error(`Error processing ${topic} webhook`, {
      error: error.message,
      orderId: payload.id,
    }, shop);
  }

  // Always return 200 to acknowledge receipt
  return new Response();
};
