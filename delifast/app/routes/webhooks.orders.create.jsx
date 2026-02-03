/**
 * Webhook Handler: orders/create
 * Triggered when a new order is created in Shopify
 */

import { authenticate, verifyShopifyWebhookHmac } from "../shopify.server";
import { handleOrderCreated } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // 1) Verify HMAC first (fixes your 401 webhook auth failures)
  const { ok, rawBody, reason } = await verifyShopifyWebhookHmac(request);

  if (!ok) {
    logger.error(
      "Webhook authentication failed",
      {
        reason,
        method: request.method,
        url: new URL(request.url).pathname,
      },
      "unknown"
    );

    // Shopify will keep retrying; return 401 so you notice it in logs.
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) Parse payload from the *raw* verified body (don’t use request.json() here)
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (e) {
    logger.error(
      "Webhook payload JSON parse failed",
      { error: e?.message },
      "unknown"
    );
    return new Response("Bad Request", { status: 400 });
  }

  // 3) Identify shop + topic from headers (works for admin-created webhooks too)
  const shop =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "unknown";

  const topic =
    request.headers.get("x-shopify-topic") ||
    request.headers.get("X-Shopify-Topic") ||
    "orders/create";

  logger.info(
    `Received ${topic} webhook`,
    {
      orderId: payload?.id,
      orderNumber: payload?.name,
    },
    shop
  );

  try {
    /**
     * 4) Optional: Try to get an Admin client if the shop is installed in your app
     * - If the webhook came from Shopify Admin-created webhook, you may NOT have an admin context.
     * - Your handler might not need admin; if it does, we attempt to create one.
     */
    let admin = null;
    try {
      // This may fail if no valid session exists; that's ok.
      admin = await authenticate.admin(request);
    } catch (e) {
      // Keep admin = null; your handler should handle it or use REST with stored token.
      logger.info(
        "No admin session available for webhook request (continuing without admin)",
        {},
        shop
      );
    }

    await handleOrderCreated(shop, payload, admin);
  } catch (error) {
    logger.error(
      `Error processing ${topic} webhook`,
      {
        error: error?.message,
        orderId: payload?.id,
      },
      shop
    );
  }

  // Always return 200 so Shopify stops retrying after successful verification/processing
  return new Response("OK", { status: 200 });
};
