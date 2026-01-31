/**
 * Webhook Handler: orders/paid
 * Triggered when an order is marked as paid in Shopify
 */

import { authenticate } from "../shopify.server";
import { handleOrderPaid } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  logger.info(`Received ${topic} webhook`, {
    orderId: payload.id,
    orderNumber: payload.name,
    financialStatus: payload.financial_status,
  }, shop);

  try {
    // Process the order asynchronously
    await handleOrderPaid(shop, payload, admin);
  } catch (error) {
    logger.error(`Error processing ${topic} webhook`, {
      error: error.message,
      orderId: payload.id,
    }, shop);
  }

  // Always return 200 to acknowledge receipt
  return new Response();
};
