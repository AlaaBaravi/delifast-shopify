/**
 * Order Mapper Service
 * Prepares Shopify order data for Delifast API
 * Mirrors the logic from WooCommerce's order-actions.php prepare_order_data_for_delifast
 */

import { prisma } from '../config/database.js';
import { logger } from './logger.js';
import { mapProvinceToCity } from '../utils/cityMapping.js';

/**
 * Prepare order data for Delifast API
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order object
 * @returns {Object} Formatted order data for Delifast
 */
export async function prepareOrderDataForDelifast(shopDomain, order) {
  // Get store settings for defaults
  const settings = await prisma.storeSettings.findUnique({
    where: { shopDomain },
  });

  if (!settings) {
    throw new Error('Store settings not found');
  }

  // Extract billing/shipping address
  const address = order.billing_address || order.shipping_address || {};
  
  const firstName = address.first_name || '';
  const lastName = address.last_name || '';
  const company = address.company || '';
  const country = address.country_code || address.country || 'AE';
  const address1 = address.address1 || '';
  const address2 = address.address2 || '';
  const province = address.province_code || address.province || '';
  const phone = address.phone || order.phone || '';
  const email = order.email || address.email || '';

  // Map province to city ID
  const cityId = mapProvinceToCity(province, settings.defaultCityId);

  logger.debug('Mapped province to city', { 
    province, 
    cityId,
    defaultCityId: settings.defaultCityId 
  }, shopDomain);

  // Process line items (products)
  const products = (order.line_items || []).map(item => {
    // Extract variant info for color/size
    const variantTitle = item.variant_title || '';
    const variantParts = variantTitle.split(' / ');
    
    let color = '';
    let size = '';
    
    // Try to extract color and size from variant title
    for (const part of variantParts) {
      const partLower = part.toLowerCase();
      if (partLower.includes('color') || partLower.includes('لون')) {
        color = part.replace(/color[:\s]*/i, '').replace(/لون[:\s]*/i, '').trim();
      } else if (partLower.includes('size') || partLower.includes('مقاس')) {
        size = part.replace(/size[:\s]*/i, '').replace(/مقاس[:\s]*/i, '').trim();
      }
    }
    
    // If no color/size found, use variant parts directly
    if (!color && !size && variantParts.length > 0) {
      if (variantParts.length === 1) {
        size = variantParts[0];
      } else if (variantParts.length >= 2) {
        color = variantParts[0];
        size = variantParts[1];
      }
    }

    return {
      ProductName: item.name || item.title || 'Product',
      Color: color,
      Size: size,
      Quantity: String(item.quantity || 1), // Must be string per WooCommerce implementation
    };
  });

  // Determine payment method and COD amount
  const financialStatus = order.financial_status || '';
  const paymentGateway = order.gateway || '';
  
  // Check if COD (Cash on Delivery)
  const isCOD = paymentGateway.toLowerCase() === 'cod' || 
                paymentGateway.toLowerCase() === 'cash_on_delivery' ||
                paymentGateway.toLowerCase().includes('cash');

  // Check if paid electronically
  const isPaid = financialStatus === 'paid' || financialStatus === 'partially_paid';

  // Calculate amounts based on payment status
  let totalPrice = parseFloat(order.total_price || 0);
  let codAmount = 0;
  let paymentMethodId = 1; // Default: prepaid
  let shippingFeesOnSender = true;
  let shippingFeesPaid = true;

  if (isCOD) {
    // Cash on delivery - full amount to collect
    codAmount = totalPrice;
    paymentMethodId = 0;
    shippingFeesOnSender = false;
    shippingFeesPaid = false;
  } else if (isPaid) {
    // Paid electronically - no collection needed
    totalPrice = 0;
    codAmount = 0;
    paymentMethodId = 1;
    shippingFeesOnSender = settings.feesOnSender;
    shippingFeesPaid = settings.feesPaid;
  } else {
    // Not paid yet - treat as COD
    codAmount = totalPrice;
    paymentMethodId = 0;
    shippingFeesOnSender = false;
    shippingFeesPaid = false;
  }

  logger.debug('Payment calculation', {
    financialStatus,
    paymentGateway,
    isCOD,
    isPaid,
    totalPrice,
    codAmount,
    paymentMethodId,
  }, shopDomain);

  // Build order data matching Delifast API format
  const orderData = {
    // Customer info
    billing_first_name: firstName,
    billing_last_name: lastName,
    billing_company: company,
    billing_country: country,
    billing_address_1: address1,
    billing_address_2: address2,
    billing_city: cityId,
    billing_state: province,
    billing_phone: phone,
    billing_email: email,
    
    // Order reference
    billing_ref: String(order.order_number || order.name || order.id),
    
    // Amounts
    totalPrice: totalPrice,
    codAmount: codAmount,
    paymentMethodId: paymentMethodId,
    
    // Shipping settings
    shippingFeesOnSender: shippingFeesOnSender,
    shippingFeesPaid: shippingFeesPaid,
    
    // Products
    Products: products,
  };

  logger.info('Prepared order data for Delifast', {
    orderRef: orderData.billing_ref,
    cityId: orderData.billing_city,
    productsCount: products.length,
    totalPrice: orderData.totalPrice,
    codAmount: orderData.codAmount,
  }, shopDomain);

  return orderData;
}

/**
 * Extract order info for display/storage
 * @param {Object} order - Shopify order object
 * @returns {Object} Extracted order info
 */
export function extractOrderInfo(order) {
  const address = order.billing_address || order.shipping_address || {};
  
  return {
    id: order.id,
    orderNumber: order.order_number || order.name,
    email: order.email,
    customerName: `${address.first_name || ''} ${address.last_name || ''}`.trim(),
    phone: address.phone || order.phone,
    totalPrice: order.total_price,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status,
    gateway: order.gateway,
    createdAt: order.created_at,
  };
}

/**
 * Check if order should be auto-sent based on settings
 * @param {string} shopDomain - Shop domain
 * @param {Object} order - Shopify order object
 * @param {string} trigger - Trigger event (created, paid, fulfilled)
 * @returns {boolean} Whether to auto-send
 */
export async function shouldAutoSend(shopDomain, order, trigger) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shopDomain },
    select: {
      mode: true,
      autoSendStatus: true,
    },
  });

  if (!settings || settings.mode !== 'auto') {
    return false;
  }

  // Map trigger to expected status
  const triggerStatusMap = {
    'created': 'created',
    'paid': 'paid',
    'fulfilled': 'fulfilled',
  };

  return settings.autoSendStatus === triggerStatusMap[trigger];
}
