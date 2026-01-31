/**
 * Settings Routes
 * Handles store settings for Delifast integration
 * Mirrors the settings from WooCommerce's settings-page.php
 */

import express from 'express';
import { logger } from '../services/logger.js';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export const settingsRoutes = express.Router();

/**
 * Middleware to authenticate settings requests
 */
function authenticateRequest(req, res, next) {
  const shopDomain = req.get('X-Shop-Domain') || config.shopify.storeDomain;
  
  if (!shopDomain) {
    return res.status(401).json({ error: 'Shop domain required' });
  }
  
  req.shopDomain = shopDomain;
  next();
}

settingsRoutes.use(authenticateRequest);

/**
 * GET /settings
 * Get all settings for the store
 */
settingsRoutes.get('/', async (req, res) => {
  const { shopDomain } = req;
  
  try {
    let settings = await prisma.storeSettings.findUnique({
      where: { shopDomain },
    });
    
    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: { shopDomain },
      });
    }
    
    // Don't return the actual password, just indicate if it's set
    const safeSettings = {
      ...settings,
      delifastPassword: settings.delifastPassword ? '********' : null,
      hasPassword: !!settings.delifastPassword,
      apiToken: undefined, // Don't expose token
      tokenExpiry: undefined,
    };
    
    res.json({ settings: safeSettings });
  } catch (error) {
    logger.error('Failed to fetch settings', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /settings
 * Update all settings
 */
settingsRoutes.put('/', async (req, res) => {
  const { shopDomain } = req;
  const updates = req.body;
  
  try {
    // Encrypt password if provided
    if (updates.delifastPassword && updates.delifastPassword !== '********') {
      updates.delifastPassword = encrypt(updates.delifastPassword);
    } else {
      // Don't update password if placeholder
      delete updates.delifastPassword;
    }
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.shopDomain;
    delete updates.apiToken;
    delete updates.tokenExpiry;
    delete updates.createdAt;
    delete updates.updatedAt;
    
    const settings = await prisma.storeSettings.upsert({
      where: { shopDomain },
      update: updates,
      create: {
        shopDomain,
        ...updates,
      },
    });
    
    logger.info('Settings updated', null, shopDomain);
    
    // Return safe settings
    const safeSettings = {
      ...settings,
      delifastPassword: settings.delifastPassword ? '********' : null,
      hasPassword: !!settings.delifastPassword,
      apiToken: undefined,
      tokenExpiry: undefined,
    };
    
    res.json({ settings: safeSettings });
  } catch (error) {
    logger.error('Failed to update settings', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * PUT /settings/general
 * Update general settings (credentials, mode)
 */
settingsRoutes.put('/general', async (req, res) => {
  const { shopDomain } = req;
  const { 
    delifastUsername, 
    delifastPassword, 
    delifastCustomerId,
    mode, 
    autoSendStatus 
  } = req.body;
  
  try {
    const updates = {};
    
    if (delifastUsername !== undefined) updates.delifastUsername = delifastUsername;
    if (delifastPassword && delifastPassword !== '********') {
      updates.delifastPassword = encrypt(delifastPassword);
      // Clear cached token when password changes
      updates.apiToken = null;
      updates.tokenExpiry = null;
    }
    if (delifastCustomerId !== undefined) updates.delifastCustomerId = delifastCustomerId;
    if (mode !== undefined) updates.mode = mode;
    if (autoSendStatus !== undefined) updates.autoSendStatus = autoSendStatus;
    
    const settings = await prisma.storeSettings.upsert({
      where: { shopDomain },
      update: updates,
      create: {
        shopDomain,
        ...updates,
      },
    });
    
    logger.info('General settings updated', null, shopDomain);
    
    res.json({ 
      success: true,
      settings: {
        delifastUsername: settings.delifastUsername,
        hasPassword: !!settings.delifastPassword,
        delifastCustomerId: settings.delifastCustomerId,
        mode: settings.mode,
        autoSendStatus: settings.autoSendStatus,
      }
    });
  } catch (error) {
    logger.error('Failed to update general settings', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * PUT /settings/sender
 * Update sender settings
 */
settingsRoutes.put('/sender', async (req, res) => {
  const { shopDomain } = req;
  const { 
    senderNo, 
    senderName, 
    senderAddress, 
    senderMobile,
    senderCityId,
    senderAreaId
  } = req.body;
  
  try {
    const updates = {};
    
    if (senderNo !== undefined) updates.senderNo = senderNo;
    if (senderName !== undefined) updates.senderName = senderName;
    if (senderAddress !== undefined) updates.senderAddress = senderAddress;
    if (senderMobile !== undefined) updates.senderMobile = senderMobile;
    if (senderCityId !== undefined) updates.senderCityId = parseInt(senderCityId) || null;
    if (senderAreaId !== undefined) updates.senderAreaId = parseInt(senderAreaId) || null;
    
    const settings = await prisma.storeSettings.upsert({
      where: { shopDomain },
      update: updates,
      create: {
        shopDomain,
        ...updates,
      },
    });
    
    logger.info('Sender settings updated', null, shopDomain);
    
    res.json({ 
      success: true,
      settings: {
        senderNo: settings.senderNo,
        senderName: settings.senderName,
        senderAddress: settings.senderAddress,
        senderMobile: settings.senderMobile,
        senderCityId: settings.senderCityId,
        senderAreaId: settings.senderAreaId,
      }
    });
  } catch (error) {
    logger.error('Failed to update sender settings', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * PUT /settings/shipping
 * Update shipping settings
 */
settingsRoutes.put('/shipping', async (req, res) => {
  const { shopDomain } = req;
  const { 
    defaultWeight, 
    defaultDimensions, 
    defaultCityId,
    paymentMethodId,
    feesOnSender,
    feesPaid
  } = req.body;
  
  try {
    const updates = {};
    
    if (defaultWeight !== undefined) updates.defaultWeight = parseFloat(defaultWeight) || 1.0;
    if (defaultDimensions !== undefined) updates.defaultDimensions = defaultDimensions;
    if (defaultCityId !== undefined) updates.defaultCityId = parseInt(defaultCityId) || 5;
    if (paymentMethodId !== undefined) updates.paymentMethodId = parseInt(paymentMethodId) || 0;
    if (feesOnSender !== undefined) updates.feesOnSender = !!feesOnSender;
    if (feesPaid !== undefined) updates.feesPaid = !!feesPaid;
    
    const settings = await prisma.storeSettings.upsert({
      where: { shopDomain },
      update: updates,
      create: {
        shopDomain,
        ...updates,
      },
    });
    
    logger.info('Shipping settings updated', null, shopDomain);
    
    res.json({ 
      success: true,
      settings: {
        defaultWeight: settings.defaultWeight,
        defaultDimensions: settings.defaultDimensions,
        defaultCityId: settings.defaultCityId,
        paymentMethodId: settings.paymentMethodId,
        feesOnSender: settings.feesOnSender,
        feesPaid: settings.feesPaid,
      }
    });
  } catch (error) {
    logger.error('Failed to update shipping settings', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /settings/status
 * Get connection status and configuration state
 */
settingsRoutes.get('/status', async (req, res) => {
  const { shopDomain } = req;
  
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { shopDomain },
    });
    
    const isConfigured = !!(
      settings?.delifastUsername && 
      settings?.delifastPassword
    );
    
    const hasToken = !!(
      settings?.apiToken && 
      settings?.tokenExpiry && 
      new Date(settings.tokenExpiry) > new Date()
    );
    
    res.json({
      isConfigured,
      hasToken,
      mode: settings?.mode || 'manual',
      autoSendStatus: settings?.autoSendStatus || 'paid',
      tokenExpiry: settings?.tokenExpiry,
    });
  } catch (error) {
    logger.error('Failed to fetch settings status', { error: error.message }, shopDomain);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});
