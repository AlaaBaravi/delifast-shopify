/**
 * Shopify API Configuration
 */

import { config } from './index.js';
import crypto from 'crypto';

/**
 * Verify Shopify webhook signature
 */
export function verifyWebhookSignature(rawBody, hmacHeader) {
  if (!config.shopify.apiSecret) {
    console.warn('SHOPIFY_API_SECRET not set, skipping webhook verification');
    return true;
  }

  const hash = crypto
    .createHmac('sha256', config.shopify.apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader || '')
  );
}

/**
 * Get Shopify GraphQL API URL
 */
export function getShopifyApiUrl(shopDomain) {
  return `https://${shopDomain}/admin/api/2024-01/graphql.json`;
}

/**
 * Make authenticated request to Shopify GraphQL API
 */
export async function shopifyGraphQL(shopDomain, accessToken, query, variables = {}) {
  const response = await fetch(getShopifyApiUrl(shopDomain), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

/**
 * Update order metafields with Delifast shipment info
 */
export async function updateOrderMetafields(shopDomain, accessToken, orderId, metafields) {
  const mutation = `
    mutation updateOrderMetafields($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          metafields(first: 10, namespace: "delifast") {
            edges {
              node {
                key
                value
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafieldsInput = Object.entries(metafields).map(([key, value]) => ({
    namespace: 'delifast',
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    type: 'single_line_text_field',
  }));

  const variables = {
    input: {
      id: orderId,
      metafields: metafieldsInput,
    },
  };

  return shopifyGraphQL(shopDomain, accessToken, mutation, variables);
}

/**
 * Add note to order
 */
export async function addOrderNote(shopDomain, accessToken, orderId, note) {
  const mutation = `
    mutation addOrderNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          note
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: orderId,
      note,
    },
  };

  return shopifyGraphQL(shopDomain, accessToken, mutation, variables);
}

/**
 * Add tags to order
 */
export async function addOrderTags(shopDomain, accessToken, orderId, tags) {
  const mutation = `
    mutation addOrderTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          ... on Order {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: orderId,
    tags: Array.isArray(tags) ? tags : [tags],
  };

  return shopifyGraphQL(shopDomain, accessToken, mutation, variables);
}

/**
 * Get orders with Delifast metafields
 */
export async function getOrdersWithDelifast(shopDomain, accessToken, limit = 50) {
  const query = `
    query getOrders($first: Int!) {
      orders(first: $first, query: "tag:delifast-*") {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            metafields(first: 10, namespace: "delifast") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  return shopifyGraphQL(shopDomain, accessToken, query, { first: limit });
}
