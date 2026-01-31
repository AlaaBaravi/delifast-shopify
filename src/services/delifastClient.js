/**
 * Delifast API Client
 * Handles all communication with Delifast API
 * Mirrors the logic from WooCommerce's api-handler.php
 */

import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { ensureValidToken, login, clearToken } from './tokenManager.js';
import { extractStatusFromResponse, isTemporaryId } from '../utils/statusMapping.js';

/**
 * Make authenticated request to Delifast API
 * @param {string} shopDomain - Shop domain
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request data
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
async function makeRequest(shopDomain, method, endpoint, data = null, params = null) {
  const token = await ensureValidToken(shopDomain);
  const url = `${config.delifast.baseUrl}${endpoint}`;

  const requestConfig = {
    method,
    url,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept-Language': 'en-US',
    },
    timeout: 30000,
  };

  if (data) {
    requestConfig.data = data;
  }

  if (params) {
    requestConfig.params = params;
  }

  logger.debug('Delifast API request', { 
    method, 
    endpoint, 
    data: data ? JSON.stringify(data).substring(0, 500) : null 
  }, shopDomain);

  try {
    const response = await axios(requestConfig);
    
    logger.debug('Delifast API response', { 
      status: response.status, 
      data: JSON.stringify(response.data).substring(0, 500) 
    }, shopDomain);

    return response.data;

  } catch (error) {
    // Handle 401 - token expired, retry with fresh token
    if (error.response?.status === 401) {
      logger.info('Token unauthorized, refreshing and retrying', null, shopDomain);
      
      await clearToken(shopDomain);
      const newToken = await login(shopDomain);
      
      requestConfig.headers['Authorization'] = `Bearer ${newToken}`;
      
      const retryResponse = await axios(requestConfig);
      return retryResponse.data;
    }

    logger.error('Delifast API error', { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data 
    }, shopDomain);

    throw error;
  }
}

/**
 * Create a shipment
 * @param {string} shopDomain - Shop domain
 * @param {Object} orderData - Order data prepared by orderMapper
 * @returns {Object} Result with shipmentId
 */
export async function createShipment(shopDomain, orderData) {
  logger.info('Creating shipment', { 
    orderRef: orderData.billing_ref 
  }, shopDomain);

  const result = await makeRequest(
    shopDomain,
    'POST',
    config.delifast.endpoints.createShipment,
    orderData
  );

  // Extract shipment ID from response
  const shipmentId = extractShipmentId(result);

  if (shipmentId) {
    logger.info('Shipment created successfully', { shipmentId }, shopDomain);
    return {
      success: true,
      shipmentId,
      isTemporary: isTemporaryId(shipmentId),
      raw: result,
    };
  }

  // Success but no ID - mark as needing lookup
  if (result.success === true) {
    logger.info('Shipment created, awaiting real ID', null, shopDomain);
    return {
      success: true,
      shipmentId: null,
      needsLookup: true,
      raw: result,
    };
  }

  logger.error('Failed to create shipment', { result }, shopDomain);
  throw new Error(result.message || 'Failed to create shipment');
}

/**
 * Deep search for shipment ID in API response
 * Mirrors the logic from WooCommerce's delifast_find_shipment_id_in_array
 * @param {Object} response - API response
 * @returns {string|null} Shipment ID
 */
function extractShipmentId(response) {
  if (!response) return null;

  // Check common field names at root level
  const idFields = [
    'shipmentId', 'ShipmentId', 
    'shipmentNo', 'ShipmentNo',
    'trackingNumber', 'TrackingNumber',
    'id', 'Id'
  ];

  for (const field of idFields) {
    if (response[field] && isValidShipmentId(response[field])) {
      return String(response[field]);
    }
  }

  // Check in SH object
  if (response.SH && typeof response.SH === 'object') {
    for (const field of idFields) {
      if (response.SH[field] && isValidShipmentId(response.SH[field])) {
        return String(response.SH[field]);
      }
    }
  }

  // Deep search in nested objects
  return deepSearchShipmentId(response, 0);
}

/**
 * Recursively search for shipment ID in nested objects
 */
function deepSearchShipmentId(obj, depth) {
  if (depth > 5 || !obj || typeof obj !== 'object') return null;

  const idFields = ['ShipmentNo', 'shipmentNo', 'shipmentId', 'ShipmentId', 'trackingNumber', 'TrackingNumber'];

  for (const field of idFields) {
    if (obj[field] && isValidShipmentId(obj[field])) {
      return String(obj[field]);
    }
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      const found = deepSearchShipmentId(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Check if a value is a valid shipment ID
 */
function isValidShipmentId(value) {
  if (!value) return false;
  const str = String(value);
  return str.length > 3 && str.length < 30;
}

/**
 * Get shipment status
 * @param {string} shopDomain - Shop domain
 * @param {string} shipmentNo - Shipment number
 * @returns {Object} Status information
 */
export async function getShipmentStatus(shopDomain, shipmentNo) {
  // Handle temporary IDs
  if (isTemporaryId(shipmentNo)) {
    logger.debug('Cannot check status for temporary ID', { shipmentNo }, shopDomain);
    return {
      status: 'new',
      statusDetails: 'Awaiting real shipment ID',
      isTemporary: true,
    };
  }

  logger.info('Checking shipment status', { shipmentNo }, shopDomain);

  // Try with query parameter first (as per WooCommerce implementation)
  try {
    const result = await makeRequest(
      shopDomain,
      'POST',
      config.delifast.endpoints.getStatus,
      { ShNo: shipmentNo },
      { shno: shipmentNo }
    );

    // Handle "Not found" response
    if (result.success === false && result.Status === 'Not found') {
      logger.warning('Shipment not found', { shipmentNo }, shopDomain);
      return {
        status: 'not_found',
        statusDetails: 'Shipment not found in Delifast system',
        success: false,
      };
    }

    const simplifiedStatus = extractStatusFromResponse(result);

    return {
      status: simplifiedStatus,
      statusDetails: result.statusDetails || result.StatusDetails || null,
      raw: result,
      success: true,
    };

  } catch (error) {
    // Try without query parameter
    if (error.response?.status === 405) {
      logger.debug('Retrying status check without query params', null, shopDomain);
      
      const result = await makeRequest(
        shopDomain,
        'POST',
        config.delifast.endpoints.getStatus,
        { ShNo: shipmentNo }
      );

      const simplifiedStatus = extractStatusFromResponse(result);

      return {
        status: simplifiedStatus,
        statusDetails: result.statusDetails || result.StatusDetails || null,
        raw: result,
        success: true,
      };
    }

    throw error;
  }
}

/**
 * Lookup shipment by order number
 * @param {string} shopDomain - Shop domain
 * @param {string} orderNumber - Order number/reference
 * @returns {string|null} Shipment ID if found
 */
export async function lookupByOrderNumber(shopDomain, orderNumber) {
  logger.info('Looking up shipment by order number', { orderNumber }, shopDomain);

  try {
    const result = await makeRequest(
      shopDomain,
      'POST',
      config.delifast.endpoints.lookupByOrderNumber,
      { OrderNumber: orderNumber }
    );

    const shipmentId = extractShipmentId(result);
    
    if (shipmentId) {
      logger.info('Found shipment ID', { orderNumber, shipmentId }, shopDomain);
      return shipmentId;
    }

    // Try alternate endpoint
    const altResult = await makeRequest(
      shopDomain,
      'POST',
      config.delifast.endpoints.lookupShipment,
      { OrderNumber: orderNumber }
    );

    const altShipmentId = extractShipmentId(altResult);
    
    if (altShipmentId) {
      logger.info('Found shipment ID (alternate)', { orderNumber, shipmentId: altShipmentId }, shopDomain);
      return altShipmentId;
    }

    logger.debug('No shipment found for order', { orderNumber }, shopDomain);
    return null;

  } catch (error) {
    logger.error('Lookup failed', { orderNumber, error: error.message }, shopDomain);
    return null;
  }
}

/**
 * Get list of cities
 * @param {string} shopDomain - Shop domain
 * @returns {Array} List of cities
 */
export async function getCities(shopDomain) {
  logger.debug('Fetching cities', null, shopDomain);
  
  const result = await makeRequest(
    shopDomain,
    'GET',
    config.delifast.endpoints.getCities
  );

  return Array.isArray(result) ? result : result.cities || [];
}

/**
 * Get areas for a city
 * @param {string} shopDomain - Shop domain
 * @param {number} cityId - City ID
 * @returns {Array} List of areas
 */
export async function getAreas(shopDomain, cityId) {
  logger.debug('Fetching areas', { cityId }, shopDomain);
  
  const result = await makeRequest(
    shopDomain,
    'GET',
    config.delifast.endpoints.getAreas,
    null,
    { cityId }
  );

  return Array.isArray(result) ? result : result.areas || [];
}

/**
 * Cancel a shipment
 * @param {string} shopDomain - Shop domain
 * @param {string} shipmentNo - Shipment number
 * @returns {Object} Result
 */
export async function cancelShipment(shopDomain, shipmentNo) {
  logger.info('Cancelling shipment', { shipmentNo }, shopDomain);

  const result = await makeRequest(
    shopDomain,
    'POST',
    config.delifast.endpoints.cancelShipment,
    { ShipmentNo: shipmentNo }
  );

  return result;
}

/**
 * Test API connection
 * @param {string} shopDomain - Shop domain
 * @returns {Object} Connection status
 */
export async function testConnection(shopDomain) {
  logger.info('Testing connection', null, shopDomain);
  
  const token = await login(shopDomain);
  
  return {
    success: true,
    hasToken: !!token,
  };
}

// Export as named object for easier importing
export const delifastClient = {
  createShipment,
  getShipmentStatus,
  lookupByOrderNumber,
  getCities,
  getAreas,
  cancelShipment,
  testConnection,
};
