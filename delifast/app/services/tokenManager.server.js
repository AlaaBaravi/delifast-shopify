/**
 * Token Manager Service
 * Handles Delifast API token caching and refresh per store
 */

import prisma from "../db.server";
import { config } from "./config.server";
import { logger } from "./logger.server";
import { decrypt } from "./encryption.server";

/**
 * Get cached token for a store
 * @param {string} shop - Shop domain
 * @returns {string|null} Token or null if expired/missing
 */
export async function getToken(shop) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
    select: {
      apiToken: true,
      tokenExpiry: true,
    },
  });

  if (!settings?.apiToken) {
    logger.debug('No token found', null, shop);
    return null;
  }

  // Check if token is expired
  if (settings.tokenExpiry && new Date(settings.tokenExpiry) <= new Date()) {
    logger.debug('Token expired', {
      expiry: settings.tokenExpiry
    }, shop);
    return null;
  }

  return settings.apiToken;
}

/**
 * Save token for a store
 * @param {string} shop - Shop domain
 * @param {string} token - API token
 * @param {Date} expiry - Token expiry date
 */
export async function setToken(shop, token, expiry = null) {
  // Default expiry: 24 hours from now
  const expiryDate = expiry || new Date(Date.now() + config.delifast.tokenExpiryHours * 60 * 60 * 1000);

  await prisma.storeSettings.update({
    where: { shop },
    data: {
      apiToken: token,
      tokenExpiry: expiryDate,
    },
  });

  logger.info('Token saved', { expiry: expiryDate }, shop);
}

/**
 * Clear token for a store
 * @param {string} shop - Shop domain
 */
export async function clearToken(shop) {
  await prisma.storeSettings.update({
    where: { shop },
    data: {
      apiToken: null,
      tokenExpiry: null,
    },
  });

  logger.info('Token cleared', null, shop);
}

/**
 * Login to Delifast API and get token
 * @param {string} shop - Shop domain
 * @returns {string} API token
 */
export async function login(shop) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
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
  }, shop);

  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData),
    });

    if (!response.ok) {
      throw new Error(`Login failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.Token) {
      logger.error('Login response missing token', { response: data }, shop);
      throw new Error('Token not found in login response');
    }

    // Save token
    await setToken(shop, data.Token);

    // Extract and save customer ID if present
    const customerId = data['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
    if (customerId) {
      await prisma.storeSettings.update({
        where: { shop },
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
        where: { shop },
        data: senderUpdates,
      });
      logger.info('Updated sender info from login response', senderUpdates, shop);
    }

    logger.info('Login successful', null, shop);
    return data.Token;

  } catch (error) {
    logger.error('Login failed', {
      error: error.message,
    }, shop);
    throw error;
  }
}

/**
 * Ensure we have a valid token, refreshing if necessary
 * @param {string} shop - Shop domain
 * @returns {string} Valid API token
 */
export async function ensureValidToken(shop) {
  // Check for cached token
  let token = await getToken(shop);

  if (token) {
    // Check if token needs refresh (30 min before expiry)
    const settings = await prisma.storeSettings.findUnique({
      where: { shop },
      select: { tokenExpiry: true },
    });

    if (settings?.tokenExpiry) {
      const refreshThreshold = new Date(
        Date.now() + config.delifast.tokenRefreshMinutes * 60 * 1000
      );

      if (new Date(settings.tokenExpiry) <= refreshThreshold) {
        logger.info('Token expiring soon, refreshing', null, shop);
        token = await login(shop);
      }
    }

    return token;
  }

  // No valid token, login fresh
  return login(shop);
}

/**
 * Check if token is valid (for status display)
 * @param {string} shop - Shop domain
 * @returns {Object} Token status
 */
export async function checkTokenStatus(shop) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
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
