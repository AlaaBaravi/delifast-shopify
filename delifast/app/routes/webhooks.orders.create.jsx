/**
 * Webhook Handler: orders/create
 * Triggered when a new order is created in Shopify
 */

import { authenticate } from "../shopify.server";
import { handleOrderCreated } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  let shop = "unknown";
  let topic = "orders/create";
  let payload;

  try {
    // Verify webhook + parse payload via Shopify helper
    const result = await authenticate.webhook(request);
    shop = result.shop;
    topic = result.topic;
    payload = result.payload;

    logger.info(
      `Received ${topic} webhook`,
      {
        orderId: payload?.id,
        orderNumber: payload?.name,
      },
      shop
    );

    try {
      // Process order (can be async, but keep webhook response fast)
      await handleOrderCreated(shop, payload, result.admin);
    } catch (error) {
      logger.error(
        `Error processing ${topic} webhook`,
        {
          error: error?.message || String(error),
          orderId: payload?.id,
        },
        shop
      );
      // Still return 200 so Shopify doesn't spam retries for internal errors
      return new Response("OK", { status: 200 });
    }

    // Acknowledge receipt
    return new Response("OK", { status: 200 });
  } catch (error) {
    // This is where 401 usually comes from (invalid HMAC, wrong secret, wrong route)
    logger.error(
      "Webhook authentication failed",
      {
        error: error?.message || String(error),
        // Helpful debug info (do NOT log full headers if you store secrets there)
        method: request.method,
        url: request.url,
      },
      shop
    );

    // Return 401 so Shopify knows it was not accepted
    return new Response("Unauthorized", { status: 401 });
  }
};
