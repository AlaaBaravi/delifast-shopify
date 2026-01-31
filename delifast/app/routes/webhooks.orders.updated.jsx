/**
 * Webhook Handler: orders/updated
 * Triggered when an order is updated in Shopify
 */

import { authenticate } from "../shopify.server";
import { handleOrderUpdated } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  logger.debug(`Received ${topic} webhook`, {
    orderId: payload.id,
    orderNumber: payload.name,
  }, shop);

  try {
    await handleOrderUpdated(shop, payload);
  } catch (error) {
    logger.error(`Error processing ${topic} webhook`, {
      error: error.message,
      orderId: payload.id,
    }, shop);
  }

  // Always return 200 to acknowledge receipt
  return new Response();
};
