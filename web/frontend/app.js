/**
 * Delifast Shopify App - Frontend
 * A simple vanilla JS frontend for the admin interface
 */

const API_BASE = '/api';
const SETTINGS_BASE = '/settings';

// State management
const state = {
  currentPage: 'settings',
  currentTab: 'general',
  settings: null,
  orders: [],
  logs: [],
  loading: false,
  message: null,
};

// DOM Elements
const app = document.getElementById('app');

// API helpers
async function apiCall(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shop-Domain': getShopDomain(),
    },
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  return response.json();
}

function getShopDomain() {
  // In real app, get from Shopify App Bridge
  return localStorage.getItem('shopDomain') || 'test-store.myshopify.com';
}

// Render functions
function render() {
  let content = '';
  
  // Header
  content += `
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
      <img src="https://portal.delifast.ae/assets/img/logo.png" alt="Delifast" style="height: 40px;" onerror="this.style.display='none'">
      <h1 style="margin: 0; font-size: 24px;">Delifast Shipping Integration</h1>
    </div>
  `;
  
  // Navigation
  content += `
    <nav class="nav">
      <a href="#" onclick="navigate('settings')" class="${state.currentPage === 'settings' ? 'active' : ''}">Settings</a>
      <a href="#" onclick="navigate('orders')" class="${state.currentPage === 'orders' ? 'active' : ''}">Orders</a>
      <a href="#" onclick="navigate('logs')" class="${state.currentPage === 'logs' ? 'active' : ''}">Logs</a>
    </nav>
  `;
  
  // Message
  if (state.message) {
    content += `<div class="alert alert-${state.message.type}">${state.message.text}</div>`;
  }
  
  // Page content
  if (state.loading) {
    content += '<div class="loading">Loading...</div>';
  } else {
    switch (state.currentPage) {
      case 'settings':
        content += renderSettings();
        break;
      case 'orders':
        content += renderOrders();
        break;
      case 'logs':
        content += renderLogs();
        break;
    }
  }
  
  app.innerHTML = content;
}

function renderSettings() {
  const s = state.settings || {};
  
  return `
    <div class="tabs">
      <div class="tab ${state.currentTab === 'general' ? 'active' : ''}" onclick="switchTab('general')">General Settings</div>
      <div class="tab ${state.currentTab === 'sender' ? 'active' : ''}" onclick="switchTab('sender')">Sender Settings</div>
      <div class="tab ${state.currentTab === 'shipping' ? 'active' : ''}" onclick="switchTab('shipping')">Shipping Settings</div>
    </div>
    
    <form id="settingsForm" onsubmit="saveSettings(event)">
      ${state.currentTab === 'general' ? renderGeneralSettings(s) : ''}
      ${state.currentTab === 'sender' ? renderSenderSettings(s) : ''}
      ${state.currentTab === 'shipping' ? renderShippingSettings(s) : ''}
      
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button type="submit" class="btn btn-primary">Save Settings</button>
        ${state.currentTab === 'general' ? '<button type="button" class="btn btn-secondary" onclick="testConnection()">Test Connection</button>' : ''}
      </div>
    </form>
  `;
}

function renderGeneralSettings(s) {
  return `
    <div class="card">
      <div class="card-header">Delifast Credentials</div>
      
      <div class="connection-status ${s.hasPassword ? 'connected' : 'disconnected'}">
        <span>${s.hasPassword ? '✓ Credentials configured' : '⚠ Credentials not configured'}</span>
      </div>
      
      <div class="form-group">
        <label>Username/Email</label>
        <input type="text" name="delifastUsername" value="${s.delifastUsername || ''}" placeholder="Enter your Delifast username">
      </div>
      
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="delifastPassword" value="${s.hasPassword ? '********' : ''}" placeholder="Enter your Delifast password">
        <div class="hint">Leave as ******** to keep existing password</div>
      </div>
      
      <div class="form-group">
        <label>Customer ID</label>
        <input type="text" name="delifastCustomerId" value="${s.delifastCustomerId || ''}" placeholder="Auto-detected after test connection">
        <div class="hint">This will be detected automatically after testing the connection</div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">Order Sending Mode</div>
      
      <div class="form-group">
        <label>Mode</label>
        <select name="mode">
          <option value="auto" ${s.mode === 'auto' ? 'selected' : ''}>Automatic (Send orders automatically)</option>
          <option value="manual" ${s.mode === 'manual' ? 'selected' : ''}>Manual (Send orders manually)</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Auto-Send Trigger</label>
        <select name="autoSendStatus">
          <option value="created" ${s.autoSendStatus === 'created' ? 'selected' : ''}>When order is created</option>
          <option value="paid" ${s.autoSendStatus === 'paid' ? 'selected' : ''}>When order is paid</option>
        </select>
        <div class="hint">Orders will be automatically sent to Delifast when they reach this status (only in Auto mode)</div>
      </div>
    </div>
  `;
}

function renderSenderSettings(s) {
  return `
    <div class="card">
      <div class="card-header">Sender Information</div>
      <div class="hint" style="margin-bottom: 16px;">This information will be used as the pickup/sender details for all shipments</div>
      
      <div class="form-group">
        <label>Sender Number</label>
        <input type="text" name="senderNo" value="${s.senderNo || ''}" placeholder="Your sender/account number">
      </div>
      
      <div class="form-group">
        <label>Sender Full Name</label>
        <input type="text" name="senderName" value="${s.senderName || ''}" placeholder="Business or personal name">
      </div>
      
      <div class="form-group">
        <label>Sender Full Address</label>
        <textarea name="senderAddress" rows="3" placeholder="Complete pickup address">${s.senderAddress || ''}</textarea>
      </div>
      
      <div class="form-group">
        <label>Sender Mobile</label>
        <input type="text" name="senderMobile" value="${s.senderMobile || ''}" placeholder="+971 XX XXX XXXX">
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Sender City ID</label>
          <input type="number" name="senderCityId" value="${s.senderCityId || ''}" placeholder="City ID (e.g., 8 for Dubai)">
        </div>
        
        <div class="form-group">
          <label>Sender Area ID</label>
          <input type="number" name="senderAreaId" value="${s.senderAreaId || ''}" placeholder="Area ID">
        </div>
      </div>
    </div>
  `;
}

function renderShippingSettings(s) {
  return `
    <div class="card">
      <div class="card-header">Default Shipping Settings</div>
      <div class="hint" style="margin-bottom: 16px;">These defaults will be used when order-specific values are not available</div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Default Weight (kg)</label>
          <input type="number" step="0.1" name="defaultWeight" value="${s.defaultWeight || 1}" min="0.1">
        </div>
        
        <div class="form-group">
          <label>Default Dimensions (LxWxH)</label>
          <input type="text" name="defaultDimensions" value="${s.defaultDimensions || '10x10x10'}" placeholder="e.g., 10x10x10">
        </div>
      </div>
      
      <div class="form-group">
        <label>Default City ID</label>
        <input type="number" name="defaultCityId" value="${s.defaultCityId || 5}" min="1">
        <div class="hint">Used when customer's city cannot be mapped to a Delifast city ID</div>
      </div>
      
      <div class="form-group">
        <label>Payment Method</label>
        <select name="paymentMethodId">
          <option value="0" ${s.paymentMethodId === 0 ? 'selected' : ''}>Cash on Delivery (COD)</option>
          <option value="1" ${s.paymentMethodId === 1 ? 'selected' : ''}>Prepaid</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Shipping Fees</label>
        <div class="checkbox-group">
          <input type="checkbox" name="feesOnSender" ${s.feesOnSender ? 'checked' : ''}>
          <span>Shipping fees on sender</span>
        </div>
        <div class="checkbox-group" style="margin-top: 8px;">
          <input type="checkbox" name="feesPaid" ${s.feesPaid ? 'checked' : ''}>
          <span>Shipping fees paid</span>
        </div>
      </div>
    </div>
  `;
}

function renderOrders() {
  const orders = state.orders || [];
  
  return `
    <div class="card">
      <div class="card-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>Delifast Shipments</span>
          <button class="btn btn-secondary" onclick="loadOrders()">Refresh</button>
        </div>
      </div>
      
      ${orders.length === 0 ? `
        <p style="text-align: center; color: #666; padding: 40px 0;">
          No shipments found. Orders sent to Delifast will appear here.
        </p>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Shipment ID</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(order => `
              <tr>
                <td>#${order.shopifyOrderNumber}</td>
                <td>
                  ${order.shipmentId || '-'}
                  ${order.isTemporaryId ? '<span style="color: #f57c00; font-size: 11px;"> (Temporary)</span>' : ''}
                </td>
                <td>
                  <span class="status-badge status-${order.status}">${formatStatus(order.status)}</span>
                </td>
                <td>${formatDate(order.createdAt)}</td>
                <td class="actions">
                  <button class="btn btn-secondary" onclick="refreshStatus('${order.shopifyOrderId}')">Refresh</button>
                  ${order.isTemporaryId ? `
                    <button class="btn btn-secondary" onclick="promptUpdateId('${order.shopifyOrderId}')">Update ID</button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

function renderLogs() {
  const logs = state.logs || [];
  
  return `
    <div class="card">
      <div class="card-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>Activity Logs</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="loadLogs()">Refresh</button>
            <button class="btn btn-secondary" onclick="clearLogs()">Clear Old Logs</button>
          </div>
        </div>
      </div>
      
      ${logs.length === 0 ? `
        <p style="text-align: center; color: #666; padding: 40px 0;">
          No logs found.
        </p>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td style="white-space: nowrap;">${formatDate(log.createdAt)}</td>
                <td>
                  <span class="status-badge status-${log.level === 'error' ? 'error' : log.level === 'warning' ? 'in_transit' : 'new'}">
                    ${log.level}
                  </span>
                </td>
                <td>${escapeHtml(log.message)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

// Navigation
function navigate(page) {
  state.currentPage = page;
  state.message = null;
  
  switch (page) {
    case 'settings':
      loadSettings();
      break;
    case 'orders':
      loadOrders();
      break;
    case 'logs':
      loadLogs();
      break;
  }
  
  render();
}

function switchTab(tab) {
  state.currentTab = tab;
  render();
}

// Data loading
async function loadSettings() {
  state.loading = true;
  render();
  
  try {
    const data = await apiCall(`${SETTINGS_BASE}`);
    state.settings = data.settings;
  } catch (error) {
    state.message = { type: 'error', text: error.message };
  }
  
  state.loading = false;
  render();
}

async function loadOrders() {
  state.loading = true;
  render();
  
  try {
    const data = await apiCall(`${API_BASE}/orders`);
    state.orders = data.shipments || [];
  } catch (error) {
    state.message = { type: 'error', text: error.message };
  }
  
  state.loading = false;
  render();
}

async function loadLogs() {
  state.loading = true;
  render();
  
  try {
    const data = await apiCall(`${API_BASE}/logs`);
    state.logs = data.logs || [];
  } catch (error) {
    state.message = { type: 'error', text: error.message };
  }
  
  state.loading = false;
  render();
}

// Actions
async function saveSettings(event) {
  event.preventDefault();
  
  const form = document.getElementById('settingsForm');
  const formData = new FormData(form);
  
  const data = {};
  formData.forEach((value, key) => {
    if (key === 'feesOnSender' || key === 'feesPaid') {
      data[key] = true;
    } else {
      data[key] = value;
    }
  });
  
  // Handle unchecked checkboxes
  if (!formData.has('feesOnSender')) data.feesOnSender = false;
  if (!formData.has('feesPaid')) data.feesPaid = false;
  
  try {
    await apiCall(`${SETTINGS_BASE}`, 'PUT', data);
    state.message = { type: 'success', text: 'Settings saved successfully!' };
    await loadSettings();
  } catch (error) {
    state.message = { type: 'error', text: error.message };
    render();
  }
}

async function testConnection() {
  state.message = { type: 'warning', text: 'Testing connection...' };
  render();
  
  try {
    await apiCall(`${API_BASE}/test-connection`, 'POST');
    state.message = { type: 'success', text: 'Connection successful! Token received.' };
    await loadSettings();
  } catch (error) {
    state.message = { type: 'error', text: `Connection failed: ${error.message}` };
    render();
  }
}

async function refreshStatus(orderId) {
  try {
    await apiCall(`${API_BASE}/orders/${orderId}/refresh-status`, 'POST');
    state.message = { type: 'success', text: 'Status refreshed!' };
    await loadOrders();
  } catch (error) {
    state.message = { type: 'error', text: error.message };
    render();
  }
}

function promptUpdateId(orderId) {
  const newId = prompt('Enter the real Delifast shipment ID:');
  if (newId) {
    updateShipmentId(orderId, newId);
  }
}

async function updateShipmentId(orderId, shipmentId) {
  try {
    await apiCall(`${API_BASE}/orders/${orderId}/shipment-id`, 'PUT', { shipmentId });
    state.message = { type: 'success', text: 'Shipment ID updated!' };
    await loadOrders();
  } catch (error) {
    state.message = { type: 'error', text: error.message };
    render();
  }
}

async function clearLogs() {
  if (!confirm('Clear logs older than 7 days?')) return;
  
  try {
    await apiCall(`${API_BASE}/logs?daysToKeep=7`, 'DELETE');
    state.message = { type: 'success', text: 'Old logs cleared!' };
    await loadLogs();
  } catch (error) {
    state.message = { type: 'error', text: error.message };
    render();
  }
}

// Helpers
function formatStatus(status) {
  const labels = {
    new: 'New',
    in_transit: 'In Transit',
    completed: 'Delivered',
    cancelled: 'Cancelled',
    returned: 'Returned',
    error: 'Error',
    not_found: 'Not Found',
  };
  return labels[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-clear messages after 5 seconds
setInterval(() => {
  if (state.message && state.message.type === 'success') {
    state.message = null;
    render();
  }
}, 5000);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
});
