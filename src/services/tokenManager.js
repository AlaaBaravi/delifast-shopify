/**
 * Token Manager Service
 * Handles Delifast API token caching and refresh
 * Mirrors the logic from WooCommerce's token-manager.php
 */

import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { decrypt } from '../utils/encryption.js';
import axios from 'axios';

/**
 * Get cached token for a store
 * @param {string} shopDomain - Shop domain
 * @returns {string|null} Token or null if expired/missing
 */
export async function getToken(shopDomain) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shopDomain },
    select: {
      apiToken: true,
      tokenExpiry: true,
    },
  });

  if (!settings?.apiToken) {
    logger.debug('No token found', null, shopDomain);
    return null;
  }

  // Check if token is expired
  if (settings.tokenExpiry && new Date(settings.tokenExpiry) <= new Date()) {
    logger.debug('Token expired', { 
      expiry: settings.tokenExpiry 
    }, shopDomain);
    return null;
  }

  return settings.apiToken;
}

/**
 * Save token for a store
 * @param {string} shopDomain - Shop domain
 * @param {string} token - API token
 * @param {Date} expiry - Token expiry date
 */
export async function setToken(shopDomain, token, expiry = null) {
  // Default expiry: 24 hours from now
  const expiryDate = expiry || new Date(Date.now() + config.delifast.tokenExpiryHours * 60 * 60 * 1000);

  await prisma.storeSettings.update({
    where: { shopDomain },
    data: {
      apiToken: token,
      tokenExpiry: expiryDate,
    },
  });

  logger.info('Token saved', { expiry: expiryDate }, shopDomain);
}

/**
 * Clear token for a store
 * @param {string} shopDomain - Shop domain
 */
export async function clearToken(shopDomain) {
  await prisma.storeSettings.update({
    where: { shopDomain },
    data: {
      apiToken: null,
      tokenExpiry: null,
    },
  });

  logger.info('Token cleared', null, shopDomain);
}

/**
 * Login to Delifast API and get token
 * @param {string} shopDomain - Shop domain
 * @returns {string} API token
 */
export async function login(shopDomain) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shopDomain },
    select: {
      delifastUsername: true,
      delifastPassword: true,
    },
  });

  if (!settings?.delifastUsername || !settings?.delifastPassword) {
    throw new Error('Delifast credentials not configured');
  }

  // Decrypt password
  const password = decrypt(settings.delifastPassword);

  const loginUrl = `${config.delifast.baseUrl}${config.delifast.endpoints.login}`;
  
  const loginData = {
    UserNameOrEmail: settings.delifastUsername,
    Password: password,
    FireBaseDeviceToken: '',
    RememberMe: true,
  };

  logger.info('Attempting Delifast login', { 
    username: settings.delifastUsername 
  }, shopDomain);

  try {
    const response = await axios.post(loginUrl, loginData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status !== 200) {
      throw new Error(`Login failed with status ${response.status}`);
    }

    const data = response.data;

    if (!data.Token) {
      logger.error('Login response missing token', { response: data }, shopDomain);
      throw new Error('Token not found in login response');
    }

    // Save token
    await setToken(shopDomain, data.Token);

    // Extract and save customer ID if present
    const customerId = data['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
    if (customerId) {
      await prisma.storeSettings.update({
        where: { shopDomain },
        data: { delifastCustomerId: customerId },
      });
    }

    // Save sender info if present in login response
    const senderUpdates = {};
    if (data.SenderNumber) senderUpdates.senderNo = data.SenderNumber;
    if (data.FullName) senderUpdates.senderName = data.FullName;
    if (data.Address) senderUpdates.senderAddress = data.Address;
    if (data.WorkPhone) senderUpdates.senderMobile = data.WorkPhone;
    if (data.CityId) senderUpdates.senderCityId = data.CityId;
    if (data.AreaId) senderUpdates.senderAreaId = data.AreaId;

    if (Object.keys(senderUpdates).length > 0) {
      await prisma.storeSettings.update({
        where: { shopDomain },
        data: senderUpdates,
      });
      logger.info('Updated sender info from login response', senderUpdates, shopDomain);
    }

    logger.info('Login successful', null, shopDomain);
    return data.Token;

  } catch (error) {
    logger.error('Login failed', { 
      error: error.message,
      response: error.response?.data 
    }, shopDomain);
    throw error;
  }
}

/**
 * Ensure we have a valid token, refreshing if necessary
 * @param {string} shopDomain - Shop domain
 * @returns {string} Valid API token
 */
export async function ensureValidToken(shopDomain) {
  // Check for cached token
  let token = await getToken(shopDomain);

  if (token) {
    // Check if token needs refresh (30 min before expiry)
    const settings = await prisma.storeSettings.findUnique({
      where: { shopDomain },
      select: { tokenExpiry: true },
    });

    if (settings?.tokenExpiry) {
      const refreshThreshold = new Date(
        Date.now() + config.delifast.tokenRefreshMinutes * 60 * 1000
      );

      if (new Date(settings.tokenExpiry) <= refreshThreshold) {
        logger.info('Token expiring soon, refreshing', null, shopDomain);
        token = await login(shopDomain);
      }
    }

    return token;
  }

  // No valid token, login fresh
  return login(shopDomain);
}

/**
 * Check if token is valid (for status display)
 * @param {string} shopDomain - Shop domain
 * @returns {Object} Token status
 */
export async function checkTokenStatus(shopDomain) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shopDomain },
    select: {
      apiToken: true,
      tokenExpiry: true,
    },
  });

  if (!settings?.apiToken) {
    return {
      hasToken: false,
      isValid: false,
      message: 'No token found',
    };
  }

  if (!settings.tokenExpiry || new Date(settings.tokenExpiry) <= new Date()) {
    return {
      hasToken: true,
      isValid: false,
      message: 'Token expired',
      expiry: settings.tokenExpiry,
    };
  }

  return {
    hasToken: true,
    isValid: true,
    message: 'Token is valid',
    expiry: settings.tokenExpiry,
  };
}
