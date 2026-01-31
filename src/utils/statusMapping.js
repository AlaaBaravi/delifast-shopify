/**
 * Status Mapping Utilities
 * Mirrors the status mapping from WooCommerce's api-handler.php and status-sync.php
 */

/**
 * Map of numeric status codes to simplified status
 */
const numericStatusMap = {
  0: 'new',
  1: 'in_transit',
  2: 'in_transit',
  3: 'in_transit',
  4: 'in_transit',
  5: 'completed',
  6: 'cancelled',
  7: 'returned',
  20: 'in_transit',
  100: 'completed',
  101: 'cancelled',
  102: 'returned',
};

/**
 * Keywords for text status matching
 */
const textStatusKeywords = {
  new: ['new', 'جديد', 'جديدة'],
  in_transit: [
    'transit', 'driver', 'office', 'process', 'pickup', 'picked',
    'قيد', 'جاري', 'مكتب', 'سائق', 'استلام'
  ],
  completed: [
    'deliver', 'complete', 'success', 'done',
    'تم', 'تسليم', 'مكتمل', 'ناجح'
  ],
  cancelled: [
    'cancel', 'void',
    'ملغي', 'ألغيت', 'الغ', 'ملغى'
  ],
  returned: [
    'return', 'rto',
    'مرتجع', 'مرجع', 'راجع'
  ],
};

/**
 * Map of simplified status to Shopify tags and fulfillment status
 */
export const shopifyStatusMap = {
  new: { 
    tag: 'delifast-new', 
    fulfillmentStatus: null,
    color: '#3498db' // Blue
  },
  in_transit: { 
    tag: 'delifast-in-transit', 
    fulfillmentStatus: 'in_transit',
    color: '#f39c12' // Orange
  },
  completed: { 
    tag: 'delifast-delivered', 
    fulfillmentStatus: 'delivered',
    color: '#2ecc71' // Green
  },
  cancelled: { 
    tag: 'delifast-cancelled', 
    fulfillmentStatus: null,
    color: '#e74c3c' // Red
  },
  returned: { 
    tag: 'delifast-returned', 
    fulfillmentStatus: null,
    color: '#9b59b6' // Purple
  },
  unknown: { 
    tag: 'delifast-unknown', 
    fulfillmentStatus: null,
    color: '#7f8c8d' // Gray
  },
};

/**
 * Extract and simplify status from Delifast API response
 * @param {Object} response - API response object
 * @returns {string} Simplified status (new, in_transit, completed, cancelled, returned, unknown)
 */
export function extractStatusFromResponse(response) {
  if (!response) {
    return 'unknown';
  }

  // List of possible status field names
  const statusFields = [
    'status', 'Status', 
    'shipmentStatus', 'ShipmentStatus',
    'CurrentStatus', 'currentStatus',
    'state', 'State'
  ];

  let statusValue = null;

  // Search in root level
  for (const field of statusFields) {
    if (response[field] !== undefined) {
      statusValue = response[field];
      break;
    }
  }

  // Search in SH object if present
  if (statusValue === null && response.SH && typeof response.SH === 'object') {
    for (const field of statusFields) {
      if (response.SH[field] !== undefined) {
        statusValue = response.SH[field];
        break;
      }
    }
  }

  // Search for any field containing 'status' in name
  if (statusValue === null) {
    for (const [key, value] of Object.entries(response)) {
      if (key.toLowerCase().includes('status')) {
        statusValue = value;
        break;
      }
    }
  }

  return mapStatusValue(statusValue);
}

/**
 * Map a status value (numeric or text) to simplified status
 * @param {number|string} value - Status value
 * @returns {string} Simplified status
 */
export function mapStatusValue(value) {
  if (value === null || value === undefined) {
    return 'unknown';
  }

  // Handle numeric status
  if (typeof value === 'number' || !isNaN(parseInt(value))) {
    const numValue = parseInt(value);
    if (numericStatusMap[numValue] !== undefined) {
      return numericStatusMap[numValue];
    }
  }

  // Handle text status
  if (typeof value === 'string') {
    const valueLower = value.toLowerCase().trim();

    // Check each status category
    for (const [status, keywords] of Object.entries(textStatusKeywords)) {
      for (const keyword of keywords) {
        if (valueLower.includes(keyword.toLowerCase())) {
          return status;
        }
      }
    }
  }

  return 'unknown';
}

/**
 * Get Shopify tag for a status
 * @param {string} status - Simplified status
 * @returns {string} Shopify tag
 */
export function getShopifyTag(status) {
  return shopifyStatusMap[status]?.tag || shopifyStatusMap.unknown.tag;
}

/**
 * Get all Delifast tags (for removing old tags)
 * @returns {string[]} All possible Delifast tags
 */
export function getAllDelifastTags() {
  return Object.values(shopifyStatusMap).map(s => s.tag);
}

/**
 * Check if a shipment ID is temporary
 * @param {string} shipmentId - Shipment ID to check
 * @returns {boolean} True if temporary
 */
export function isTemporaryId(shipmentId) {
  if (!shipmentId) return false;
  return shipmentId.startsWith('DELIFAST-') || 
         shipmentId.startsWith('PENDING-') ||
         shipmentId.startsWith('TEMP-');
}

/**
 * Generate a temporary shipment ID
 * @param {string} orderNumber - Order number
 * @returns {string} Temporary shipment ID
 */
export function generateTemporaryId(orderNumber) {
  const timestamp = Date.now();
  return `PENDING-${orderNumber}-${timestamp}`;
}

/**
 * Get human-readable status label
 * @param {string} status - Simplified status
 * @returns {string} Human-readable label
 */
export function getStatusLabel(status) {
  const labels = {
    new: 'New',
    in_transit: 'In Transit',
    completed: 'Delivered',
    cancelled: 'Cancelled',
    returned: 'Returned',
    unknown: 'Unknown',
  };
  return labels[status] || labels.unknown;
}

/**
 * Get Arabic status label
 * @param {string} status - Simplified status
 * @returns {string} Arabic label
 */
export function getStatusLabelAr(status) {
  const labels = {
    new: 'جديد',
    in_transit: 'قيد التوصيل',
    completed: 'تم التسليم',
    cancelled: 'ملغي',
    returned: 'مرتجع',
    unknown: 'غير معروف',
  };
  return labels[status] || labels.unknown;
}
