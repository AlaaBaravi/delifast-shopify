import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server"; // optional, if you have it

export const action = async ({ request }) => {
  let shop = "unknown";
  let topic = "app/uninstalled";

  try {
    // ✅ Verifies webhook HMAC + parses Shopify headers
    const result = await authenticate.webhook(request);
    shop = result.shop || shop;
    topic = result.topic || topic;

    // result.session may be null if already deleted (normal)
    const session = result.session;

    // Use your logger if you want; console is fine too
    if (logger?.info) {
      logger.info(`Received ${topic} webhook`, {}, shop);
    } else {
      console.log(`Received ${topic} webhook for ${shop}`);
    }

    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    // Always respond 200 so Shopify doesn't retry
    return new Response("OK", { status: 200 });
  } catch (error) {
    // If HMAC fails or anything throws, log and still return 200
    // (Returning 401 is okay for HMAC failure, but returning 200 avoids retry storms)
    if (logger?.error) {
      logger.error(
        "Error processing app/uninstalled webhook",
        { error: error?.message },
        shop
      );
    } else {
      console.error("Error processing app/uninstalled webhook", error);
    }

    return new Response("OK", { status: 200 });
  }
};
