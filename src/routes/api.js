/**
 * Admin API Routes
 * Provides endpoints for the admin UI to interact with the app
 */

import express from 'express';
import { logger } from '../services/logger.js';
import { prisma } from '../config/database.js';
import { delifastClient } from '../services/delifastClient.js';
import { sendOrderToDelifast, refreshOrderStatus } from '../services/orderHandler.js';
import { config } from '../config/index.js';

export const apiRoutes = express.Router();

/**
 * Middleware to authenticate API requests
 * For private apps, we verify the request comes from our frontend
 */
function authenticateRequest(req, res, next) {
  // In a private app setup, we trust requests from the same origin
  // For public apps, you would verify the session token here
  const shopDomain = req.get('X-Shop-Domain') || config.shopify.storeDomain;
  
  if (!shopDomain) {
    return res.status(401).json({ error: 'Shop domain required' });
  }
  
  req.shopDomain = shopDomain;
  next();
}

apiRoutes.use(authenticateRequest);

/**
 * GET /api/orders
 * Get orders with Delifast shipment info
 */
apiRoutes.get('/orders', async (req, res) => {
  const { shopDomain } = req;
  const { status, limit = 50, offset = 0 } = req.query;
  
  try {
    const where = { shopDomain };
    if (status) {
      where.status = status;
    }
    
    const shipments = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });
    
    const total = await prisma.shipment.count({ where });
    
    res.json({ 
      shipments, 
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Failed to fetch orders', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/orders/:orderId
 * Get single order shipment info
 */
apiRoutes.get('/orders/:orderId', async (req, res) => {
  const { shopDomain } = req;
  const { orderId } = req.params;
  
  try {
    const shipment = await prisma.shipment.findUnique({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain,
          shopifyOrderId: orderId,
        },
      },
    });
    
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    res.json({ shipment });
  } catch (error) {
    logger.error('Failed to fetch order', { error: error.message, orderId }, shopDomain);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * POST /api/orders/:orderId/send
 * Manually send order to Delifast
 */
apiRoutes.post('/orders/:orderId/send', async (req, res) => {
  const { shopDomain } = req;
  const { orderId } = req.params;
  const { orderData } = req.body;
  
  try {
    // Check if already sent
    const existing = await prisma.shipment.findUnique({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain,
          shopifyOrderId: orderId,
        },
      },
    });
    
    if (existing && existing.shipmentId) {
      return res.status(400).json({ 
        error: 'Order already sent to Delifast',
        shipmentId: existing.shipmentId 
      });
    }
    
    const result = await sendOrderToDelifast(shopDomain, orderData);
    
    res.json({ 
      success: true, 
      shipmentId: result.shipmentId,
      isTemporary: result.isTemporary
    });
  } catch (error) {
    logger.error('Failed to send order', { error: error.message, orderId }, shopDomain);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/orders/:orderId/refresh-status
 * Refresh shipment status from Delifast
 */
apiRoutes.post('/orders/:orderId/refresh-status', async (req, res) => {
  const { shopDomain } = req;
  const { orderId } = req.params;
  
  try {
    const result = await refreshOrderStatus(shopDomain, orderId);
    res.json(result);
  } catch (error) {
    logger.error('Failed to refresh status', { error: error.message, orderId }, shopDomain);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/orders/:orderId/shipment-id
 * Update shipment ID (for temporary ID replacement)
 */
apiRoutes.put('/orders/:orderId/shipment-id', async (req, res) => {
  const { shopDomain } = req;
  const { orderId } = req.params;
  const { shipmentId } = req.body;
  
  if (!shipmentId) {
    return res.status(400).json({ error: 'Shipment ID required' });
  }
  
  try {
    const shipment = await prisma.shipment.update({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain,
          shopifyOrderId: orderId,
        },
      },
      data: {
        shipmentId,
        isTemporaryId: false,
        updatedAt: new Date(),
      },
    });
    
    logger.info('Shipment ID updated manually', { orderId, shipmentId }, shopDomain);
    
    // Refresh status with new ID
    const status = await refreshOrderStatus(shopDomain, orderId);
    
    res.json({ 
      success: true, 
      shipment,
      status 
    });
  } catch (error) {
    logger.error('Failed to update shipment ID', { error: error.message, orderId }, shopDomain);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/test-connection
 * Test Delifast API connection
 */
apiRoutes.post('/test-connection', async (req, res) => {
  const { shopDomain } = req;
  
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { shopDomain },
    });
    
    if (!settings?.delifastUsername || !settings?.delifastPassword) {
      return res.status(400).json({ 
        error: 'Delifast credentials not configured' 
      });
    }
    
    const result = await delifastClient.testConnection(shopDomain);
    
    res.json({ 
      success: true, 
      message: 'Connection successful',
      customerId: result.customerId
    });
  } catch (error) {
    logger.error('Connection test failed', { error: error.message }, shopDomain);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/cities
 * Get list of Delifast cities
 */
apiRoutes.get('/cities', async (req, res) => {
  const { shopDomain } = req;
  
  try {
    const cities = await delifastClient.getCities(shopDomain);
    res.json({ cities });
  } catch (error) {
    logger.error('Failed to fetch cities', { error: error.message }, shopDomain);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/areas/:cityId
 * Get areas for a city
 */
apiRoutes.get('/areas/:cityId', async (req, res) => {
  const { shopDomain } = req;
  const { cityId } = req.params;
  
  try {
    const areas = await delifastClient.getAreas(shopDomain, cityId);
    res.json({ areas });
  } catch (error) {
    logger.error('Failed to fetch areas', { error: error.message, cityId }, shopDomain);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs
 * Get logs for the store
 */
apiRoutes.get('/logs', async (req, res) => {
  const { shopDomain } = req;
  const { level, limit = 100, offset = 0 } = req.query;
  
  try {
    const logs = await logger.getLogs(shopDomain, {
      level,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * DELETE /api/logs
 * Clear old logs
 */
apiRoutes.delete('/logs', async (req, res) => {
  const { shopDomain } = req;
  const { daysToKeep = 7 } = req.query;
  
  try {
    const count = await logger.clearOldLogs(shopDomain, parseInt(daysToKeep));
    res.json({ success: true, deleted: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

/**
 * POST /api/bulk/send
 * Bulk send orders to Delifast
 */
apiRoutes.post('/bulk/send', async (req, res) => {
  const { shopDomain } = req;
  const { orderIds, ordersData } = req.body;
  
  if (!orderIds?.length || !ordersData?.length) {
    return res.status(400).json({ error: 'Order IDs and data required' });
  }
  
  const results = {
    success: [],
    failed: [],
  };
  
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];
    const orderData = ordersData[i];
    
    try {
      const result = await sendOrderToDelifast(shopDomain, orderData);
      results.success.push({ orderId, shipmentId: result.shipmentId });
    } catch (error) {
      results.failed.push({ orderId, error: error.message });
    }
  }
  
  res.json(results);
});

/**
 * POST /api/bulk/refresh-status
 * Bulk refresh statuses
 */
apiRoutes.post('/bulk/refresh-status', async (req, res) => {
  const { shopDomain } = req;
  const { orderIds } = req.body;
  
  if (!orderIds?.length) {
    return res.status(400).json({ error: 'Order IDs required' });
  }
  
  const results = {
    success: [],
    failed: [],
  };
  
  for (const orderId of orderIds) {
    try {
      const result = await refreshOrderStatus(shopDomain, orderId);
      results.success.push({ orderId, status: result.status });
    } catch (error) {
      results.failed.push({ orderId, error: error.message });
    }
  }
  
  res.json(results);
});
