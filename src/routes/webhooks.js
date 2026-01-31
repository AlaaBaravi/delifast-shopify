/**
 * Shopify Webhook Routes
 * Handles incoming webhooks from Shopify for order events
 */

import express from 'express';
import { verifyWebhookSignature } from '../config/shopify.js';
import { logger } from '../services/logger.js';
import { handleOrderCreated, handleOrderPaid, handleOrderUpdated } from '../services/orderHandler.js';

export const webhookRoutes = express.Router();

/**
 * Middleware to verify Shopify webhook signature
 */
function verifyWebhook(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shopDomain = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, hmac)) {
    logger.warning('Invalid webhook signature', { shopDomain });
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Parse the raw body
  try {
    req.parsedBody = JSON.parse(req.body.toString());
    req.shopDomain = shopDomain;
  } catch (error) {
    logger.error('Failed to parse webhook body', { error: error.message });
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  
  next();
}

/**
 * POST /webhooks/orders/create
 * Triggered when a new order is created
 */
webhookRoutes.post('/orders/create', verifyWebhook, async (req, res) => {
  const { shopDomain, parsedBody: order } = req;
  
  logger.info('Received orders/create webhook', { 
    orderId: order.id, 
    orderNumber: order.name 
  }, shopDomain);

  // Respond immediately to Shopify
  res.status(200).json({ received: true });

  // Process asynchronously
  try {
    await handleOrderCreated(shopDomain, order);
  } catch (error) {
    logger.error('Error processing orders/create webhook', { 
      error: error.message,
      orderId: order.id 
    }, shopDomain);
  }
});

/**
 * POST /webhooks/orders/paid
 * Triggered when an order is paid
 */
webhookRoutes.post('/orders/paid', verifyWebhook, async (req, res) => {
  const { shopDomain, parsedBody: order } = req;
  
  logger.info('Received orders/paid webhook', { 
    orderId: order.id, 
    orderNumber: order.name 
  }, shopDomain);

  // Respond immediately to Shopify
  res.status(200).json({ received: true });

  // Process asynchronously
  try {
    await handleOrderPaid(shopDomain, order);
  } catch (error) {
    logger.error('Error processing orders/paid webhook', { 
      error: error.message,
      orderId: order.id 
    }, shopDomain);
  }
});

/**
 * POST /webhooks/orders/updated
 * Triggered when an order is updated
 */
webhookRoutes.post('/orders/updated', verifyWebhook, async (req, res) => {
  const { shopDomain, parsedBody: order } = req;
  
  logger.info('Received orders/updated webhook', { 
    orderId: order.id, 
    orderNumber: order.name 
  }, shopDomain);

  // Respond immediately to Shopify
  res.status(200).json({ received: true });

  // Process asynchronously
  try {
    await handleOrderUpdated(shopDomain, order);
  } catch (error) {
    logger.error('Error processing orders/updated webhook', { 
      error: error.message,
      orderId: order.id 
    }, shopDomain);
  }
});

/**
 * POST /webhooks/app/uninstalled
 * Triggered when the app is uninstalled
 */
webhookRoutes.post('/app/uninstalled', verifyWebhook, async (req, res) => {
  const { shopDomain } = req;
  
  logger.info('App uninstalled', null, shopDomain);

  res.status(200).json({ received: true });

  // Clean up store data (optional - you may want to keep it)
  // await prisma.storeSettings.delete({ where: { shopDomain } });
});
