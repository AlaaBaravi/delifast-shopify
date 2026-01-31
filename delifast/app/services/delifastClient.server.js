/**
 * Delifast API Client
 * Handles all communication with Delifast API
 */

import { config } from "./config.server";
import { logger } from "./logger.server";
import { ensureValidToken, login, clearToken } from "./tokenManager.server";
import { extractStatusFromResponse, isTemporaryId } from "../utils/statusMapping";

/**
 * Make authenticated request to Delifast API
 * @param {string} shop - Shop domain
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request data
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
async function makeRequest(shop, method, endpoint, data = null, params = null) {
  const token = await ensureValidToken(shop);
  let url = `${config.delifast.baseUrl}${endpoint}`;

  // Add query parameters
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const requestConfig = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept-Language': 'en-US',
    },
  };

  if (data) {
    requestConfig.body = JSON.stringify(data);
  }

  logger.debug('Delifast API request', {
    method,
    endpoint,
    data: data ? JSON.stringify(data).substring(0, 500) : null
  }, shop);

  try {
    const response = await fetch(url, requestConfig);
    const responseData = await response.json();

    logger.debug('Delifast API response', {
      status: response.status,
      data: JSON.stringify(responseData).substring(0, 500)
    }, shop);

    if (!response.ok) {
      // Handle 401 - token expired, retry with fresh token
      if (response.status === 401) {
        logger.info('Token unauthorized, refreshing and retrying', null, shop);

        await clearToken(shop);
        const newToken = await login(shop);

        requestConfig.headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, requestConfig);
        return retryResponse.json();
      }

      throw new Error(`API error: ${response.status} - ${JSON.stringify(responseData)}`);
    }

    return responseData;

  } catch (error) {
    logger.error('Delifast API error', {
      error: error.message,
      endpoint,
    }, shop);

    throw error;
  }
}

/**
 * Create a shipment
 * @param {string} shop - Shop domain
 * @param {Object} orderData - Order data prepared by orderMapper
 * @returns {Object} Result with shipmentId
 */
export async function createShipment(shop, orderData) {
  logger.info('Creating shipment', {
    orderRef: orderData.billing_ref
  }, shop);

  const result = await makeRequest(
    shop,
    'POST',
    config.delifast.endpoints.createShipment,
    orderData
  );

  // Extract shipment ID from response
  const shipmentId = extractShipmentId(result);

  if (shipmentId) {
    logger.info('Shipment created successfully', { shipmentId }, shop);
    return {
      success: true,
      shipmentId,
      isTemporary: isTemporaryId(shipmentId),
      raw: result,
    };
  }

  // Success but no ID - mark as needing lookup
  if (result.success === true) {
    logger.info('Shipment created, awaiting real ID', null, shop);
    return {
      success: true,
      shipmentId: null,
      needsLookup: true,
      raw: result,
    };
  }

  logger.error('Failed to create shipment', { result }, shop);
  throw new Error(result.message || 'Failed to create shipment');
}

/**
 * Deep search for shipment ID in API response
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
 * @param {string} shop - Shop domain
 * @param {string} shipmentNo - Shipment number
 * @returns {Object} Status information
 */
export async function getShipmentStatus(shop, shipmentNo) {
  // Handle temporary IDs
  if (isTemporaryId(shipmentNo)) {
    logger.debug('Cannot check status for temporary ID', { shipmentNo }, shop);
    return {
      status: 'new',
      statusDetails: 'Awaiting real shipment ID',
      isTemporary: true,
    };
  }

  logger.info('Checking shipment status', { shipmentNo }, shop);

  // Try with query parameter first
  try {
    const result = await makeRequest(
      shop,
      'POST',
      config.delifast.endpoints.getStatus,
      { ShNo: shipmentNo },
      { shno: shipmentNo }
    );

    // Handle "Not found" response
    if (result.success === false && result.Status === 'Not found') {
      logger.warning('Shipment not found', { shipmentNo }, shop);
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
    try {
      const result = await makeRequest(
        shop,
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
    } catch (retryError) {
      throw retryError;
    }
  }
}

/**
 * Lookup shipment by order number
 * @param {string} shop - Shop domain
 * @param {string} orderNumber - Order number/reference
 * @returns {string|null} Shipment ID if found
 */
export async function lookupByOrderNumber(shop, orderNumber) {
  logger.info('Looking up shipment by order number', { orderNumber }, shop);

  try {
    const result = await makeRequest(
      shop,
      'POST',
      config.delifast.endpoints.lookupByOrderNumber,
      { OrderNumber: orderNumber }
    );

    const shipmentId = extractShipmentId(result);

    if (shipmentId) {
      logger.info('Found shipment ID', { orderNumber, shipmentId }, shop);
      return shipmentId;
    }

    // Try alternate endpoint
    const altResult = await makeRequest(
      shop,
      'POST',
      config.delifast.endpoints.lookupShipment,
      { OrderNumber: orderNumber }
    );

    const altShipmentId = extractShipmentId(altResult);

    if (altShipmentId) {
      logger.info('Found shipment ID (alternate)', { orderNumber, shipmentId: altShipmentId }, shop);
      return altShipmentId;
    }

    logger.debug('No shipment found for order', { orderNumber }, shop);
    return null;

  } catch (error) {
    logger.error('Lookup failed', { orderNumber, error: error.message }, shop);
    return null;
  }
}

/**
 * Get list of cities
 * @param {string} shop - Shop domain
 * @returns {Array} List of cities
 */
export async function getCities(shop) {
  logger.debug('Fetching cities', null, shop);

  const result = await makeRequest(
    shop,
    'GET',
    config.delifast.endpoints.getCities
  );

  return Array.isArray(result) ? result : result.cities || [];
}

/**
 * Get areas for a city
 * @param {string} shop - Shop domain
 * @param {number} cityId - City ID
 * @returns {Array} List of areas
 */
export async function getAreas(shop, cityId) {
  logger.debug('Fetching areas', { cityId }, shop);

  const result = await makeRequest(
    shop,
    'GET',
    config.delifast.endpoints.getAreas,
    null,
    { cityId }
  );

  return Array.isArray(result) ? result : result.areas || [];
}

/**
 * Cancel a shipment
 * @param {string} shop - Shop domain
 * @param {string} shipmentNo - Shipment number
 * @returns {Object} Result
 */
export async function cancelShipment(shop, shipmentNo) {
  logger.info('Cancelling shipment', { shipmentNo }, shop);

  const result = await makeRequest(
    shop,
    'POST',
    config.delifast.endpoints.cancelShipment,
    { ShipmentNo: shipmentNo }
  );

  return result;
}

/**
 * Test API connection
 * @param {string} shop - Shop domain
 * @returns {Object} Connection status
 */
export async function testConnection(shop) {
  logger.info('Testing connection', null, shop);

  const token = await login(shop);

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
