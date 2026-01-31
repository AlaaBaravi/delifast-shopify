/**
 * Application Configuration
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Environment
  isDev: process.env.NODE_ENV !== 'production',
  
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'http://localhost:3000',
  
  // Shopify
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES?.split(',') || [
      'read_orders',
      'write_orders',
      'write_fulfillments',
      'read_customers',
      'write_metafields'
    ],
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  },
  
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
  
  // Encryption
  encryptionKey: process.env.ENCRYPTION_KEY || 'default_key_change_in_production',
  
  // Job settings
  jobs: {
    maxLookupAttempts: 24, // Max attempts to find real shipment ID
    lookupIntervalMinutes: 60, // Time between lookup attempts
  }
};
