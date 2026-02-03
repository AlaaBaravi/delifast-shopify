import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import crypto from "node:crypto";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

/**
 * Verify Shopify webhook HMAC signature.
 *
 * IMPORTANT:
 * - If the webhook is created by your APP (webhook subscription), it will usually be signed using SHOPIFY_API_SECRET.
 * - If the webhook is created manually in Shopify Admin -> Settings -> Notifications -> Webhooks,
 *   Shopify may sign using a different "signing secret" (what you see on that page).
 *
 * To support both cases:
 * - Set SHOPIFY_WEBHOOK_SECRET to the "Your webhooks will be signed with" value (if you are using admin-created webhooks).
 * - Otherwise it falls back to SHOPIFY_API_SECRET.
 */
export async function verifyShopifyWebhookHmac(request, secret) {
  const hmacHeader =
    request.headers.get("x-shopify-hmac-sha256") ||
    request.headers.get("X-Shopify-Hmac-Sha256");

  if (!hmacHeader) {
    return { ok: false, reason: "Missing X-Shopify-Hmac-Sha256 header" };
  }

  const signingSecret =
    secret ||
    process.env.SHOPIFY_WEBHOOK_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    "";

  if (!signingSecret) {
    return { ok: false, reason: "Missing webhook signing secret" };
  }

  // Read raw body safely without consuming the original request stream
  const rawBody = await request.clone().text();

  const digest = crypto
    .createHmac("sha256", signingSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const safeEqual = (a, b) => {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  };

  const ok = safeEqual(digest, hmacHeader);

  return {
    ok,
    rawBody,
    reason: ok ? undefined : "HMAC validation failed",
  };
}

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
