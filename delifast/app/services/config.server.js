/**
 * Delifast App Configuration
 * Centralized configuration for the Delifast Shopify App
 */

export const config = {
  // Environment
  isDev: process.env.NODE_ENV !== 'production',

  // Delifast API
  delifast: {
    baseUrl: 'https://portal.delifast.ae/api',
    endpoints: {
      login: '/Login/Login',
      createShipment: '/Customer/WooCommerceCreateShipment',
      getStatus: '/Customer/WooCommerceShipmentstatue',
      lookupByOrderNumber: '/Customer/LookupOrderShipments',
      lookupShipment: '/Customer/LookupShipmentByOrderNumber',
      getCities: '/Customer/GetCities',
      getAreas: '/Customer/GetAreas',
      cancelShipment: '/Customer/CancelShipment',
      getPaymentMethods: '/Customer/GetPaymentMethods',
    },
    tokenExpiryHours: 24,
    tokenRefreshMinutes: 30, // Refresh 30 min before expiry
  },

  // Encryption key for storing credentials
  encryptionKey: process.env.ENCRYPTION_KEY || 'delifast_shopify_app_default_key_change_in_production',

  // Job settings
  jobs: {
    maxLookupAttempts: 24, // Max attempts to find real shipment ID
    lookupIntervalMinutes: 60, // Time between lookup attempts
  },
};
