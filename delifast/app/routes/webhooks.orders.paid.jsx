/**
 * Webhook Handler: orders/paid
 * Triggered when an order is marked as paid in Shopify
 */

import shopify, { verifyShopifyWebhookHmac } from "../shopify.server";
import { handleOrderPaid } from "../services/orderHandler.server";
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
    // Shopify will retry on 4xx/5xx.
    // If payload is invalid, retry won't help, so respond 200.
    return new Response("OK", { status: 200 });
  }

  // 3) Shop + topic from headers
  const shop =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "unknown";

  const topic =
    request.headers.get("x-shopify-topic") ||
    request.headers.get("X-Shopify-Topic") ||
    "orders/paid";

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
    /**
     * 4) Create an Admin API client using the OFFLINE session for this shop (recommended).
     * Webhooks do NOT come with a browser session, so authenticate.admin() is not reliable here.
     *
     * The exact method name can vary by Shopify library version, but the idea is:
     * - load offline session from sessionStorage
     * - create admin client from that session
     */
    let admin = null;

    try {
      // Offline session id is usually: `offline_${shop}`
      const offlineSessionId = `offline_${shop}`;
      const session = await shopify.sessionStorage.loadSession(offlineSessionId);

      if (session) {
        const { admin: adminClient } = await shopify.api.clients.adminRest({
          session,
        });
        admin = adminClient;
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

    await handleOrderPaid(shop, payload, admin);
  } catch (error) {
    logger.error(
      `Error processing ${topic} webhook`,
      {
        error: error?.message,
        orderId: payload?.id,
      },
      shop
    );

    // Important: return 200 to prevent Shopify retry storms for errors you will handle internally.
    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
};
