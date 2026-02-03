/**
 * Webhook Handler: orders/create
 * Triggered when a new order is created in Shopify
 */

import shopify, { verifyShopifyWebhookHmac } from "../shopify.server";
import { handleOrderCreated } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // 1) Verify HMAC first
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

    // HMAC failure is real auth failure -> 401 is correct
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) Parse payload from verified raw body
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (e) {
    logger.error(
      "Webhook payload JSON parse failed",
      { error: e?.message },
      "unknown"
    );
    // Retry won't help if JSON is invalid, so acknowledge to stop retries
    return new Response("OK", { status: 200 });
  }

  // 3) Identify shop + topic from headers
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
     * 4) OPTIONAL: If your handler needs Admin API, create it from the OFFLINE session.
     * Webhooks do not include a browser/admin session, so authenticate.admin() is not reliable here.
     */
    let admin = null;

    try {
      const offlineSessionId = `offline_${shop}`;
      const session = await shopify.sessionStorage.loadSession(offlineSessionId);

      if (session) {
        // ⚠️ This exact client creation may differ by your package version.
        // If you already create an admin client elsewhere, reuse that approach here.
        const client = new shopify.api.clients.Graphql({ session });
        admin = client;
      } else {
        logger.info(
          "No offline session found for shop (continuing without admin client)",
          {},
          shop
        );
      }
    } catch (e) {
      logger.info(
        "Failed to build admin client from offline session (continuing without admin)",
        { error: e?.message },
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

    // Prevent Shopify retry storms for internal errors you handle/log
    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
};
