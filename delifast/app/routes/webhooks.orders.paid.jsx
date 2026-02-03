/**
 * Webhook Handler: orders/paid
 * Triggered when an order is marked as paid in Shopify
 */

import { authenticate } from "../shopify.server";
import { handleOrderPaid } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  let shop = "unknown";
  let topic = "orders/paid";
  let payload;

  try {
    // Verify webhook + parse payload
    const result = await authenticate.webhook(request);
    shop = result.shop;
    topic = result.topic;
    payload = result.payload;

    logger.info(
      `Received ${topic} webhook`,
      {
        orderId: payload?.id,
        orderNumber: payload?.name,
        financialStatus: payload?.financial_status,
      },
      shop
    );

    try {
      await handleOrderPaid(shop, payload, result.admin);
    } catch (error) {
      logger.error(
        `Error processing ${topic} webhook`,
        {
          error: error?.message || String(error),
          orderId: payload?.id,
        },
        shop
      );

      // Still acknowledge receipt to avoid endless retries if our internal logic fails
      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    // This is usually HMAC verification failure (wrong secret) or wrong route file path
    logger.error(
      "Webhook authentication failed",
      {
        error: error?.message || String(error),
        method: request.method,
        url: request.url,
      },
      shop
    );

    return new Response("Unauthorized", { status: 401 });
  }
};
