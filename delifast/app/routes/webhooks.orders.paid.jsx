/**
 * Webhook Handler: orders/paid
 * Triggered when an order is marked as paid in Shopify
 */

import { authenticate, verifyShopifyWebhookHmac } from "../shopify.server";
import { handleOrderPaid } from "../services/orderHandler.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // 1) Verify HMAC first (fixes 401 webhook failures)
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
    return new Response("Bad Request", { status: 400 });
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
    // 4) Optional admin client if session exists
    let admin = null;
    try {
      admin = await authenticate.admin(request);
    } catch {
      logger.info(
        "No admin session available for webhook request (continuing without admin)",
        {},
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
  }

  return new Response("OK", { status: 200 });
};
