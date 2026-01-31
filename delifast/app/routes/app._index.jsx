/**
 * Dashboard Page
 * Main dashboard showing overview of Delifast integration status
 */

import { useLoaderData, useFetcher, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkTokenStatus } from "../services/tokenManager.server";
import { getStatusLabel } from "../utils/statusMapping";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get settings
  let settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: { shop },
    });
  }

  // Get token status
  const tokenStatus = await checkTokenStatus(shop);

  // Get shipment stats
  const [totalShipments, newCount, inTransitCount, completedCount, errorCount, recentShipments] = await Promise.all([
    prisma.shipment.count({ where: { shop } }),
    prisma.shipment.count({ where: { shop, status: 'new' } }),
    prisma.shipment.count({ where: { shop, status: 'in_transit' } }),
    prisma.shipment.count({ where: { shop, status: 'completed' } }),
    prisma.shipment.count({ where: { shop, status: 'error' } }),
    prisma.shipment.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  // Get recent logs
  const recentLogs = await prisma.log.findMany({
    where: { shop, level: { in: ['warning', 'error'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return {
    shop,
    isConfigured: !!settings.delifastUsername && !!settings.delifastPassword,
    tokenStatus,
    mode: settings.mode,
    stats: {
      total: totalShipments,
      new: newCount,
      inTransit: inTransitCount,
      completed: completedCount,
      error: errorCount,
    },
    recentShipments,
    recentLogs,
  };
};

export default function Dashboard() {
  const { shop, isConfigured, tokenStatus, mode, stats, recentShipments, recentLogs } = useLoaderData();
  const shopify = useAppBridge();

  return (
    <s-page heading="Delifast Dashboard">
      <s-link slot="primary-action" href="/app/settings">
        <s-button>Settings</s-button>
      </s-link>

      {/* Configuration Warning */}
      {!isConfigured && (
        <s-banner tone="warning">
          <s-text fontWeight="semibold">Setup Required</s-text>
          <s-text>
            Please configure your Delifast credentials to start sending orders.
          </s-text>
          <s-link href="/app/settings">
            <s-button variant="plain">Go to Settings</s-button>
          </s-link>
        </s-banner>
      )}

      {/* Connection Status */}
      <s-section heading="Connection Status">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
            <s-stack direction="block" gap="tight">
              <s-text variant="subdued">API Connection</s-text>
              {tokenStatus.isValid ? (
                <s-badge tone="success">Connected</s-badge>
              ) : tokenStatus.hasToken ? (
                <s-badge tone="warning">Token Expired</s-badge>
              ) : (
                <s-badge tone="critical">Not Connected</s-badge>
              )}
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
            <s-stack direction="block" gap="tight">
              <s-text variant="subdued">Mode</s-text>
              <s-badge tone={mode === 'auto' ? 'success' : 'info'}>
                {mode === 'auto' ? 'Automatic' : 'Manual'}
              </s-badge>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
            <s-stack direction="block" gap="tight">
              <s-text variant="subdued">Store</s-text>
              <s-text fontWeight="semibold">{shop}</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Shipment Stats */}
      <s-section heading="Shipment Overview">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ flex: 1, textAlign: 'center' }}>
            <s-text variant="headingLg">{stats.total}</s-text>
            <s-text variant="subdued">Total Shipments</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: 'center' }}>
            <s-text variant="headingLg" tone="info">{stats.new}</s-text>
            <s-text variant="subdued">New</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: 'center' }}>
            <s-text variant="headingLg" tone="warning">{stats.inTransit}</s-text>
            <s-text variant="subdued">In Transit</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: 'center' }}>
            <s-text variant="headingLg" tone="success">{stats.completed}</s-text>
            <s-text variant="subdued">Completed</s-text>
          </s-box>
          {stats.error > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: 'center' }}>
              <s-text variant="headingLg" tone="critical">{stats.error}</s-text>
              <s-text variant="subdued">Errors</s-text>
            </s-box>
          )}
        </s-stack>
        <s-link href="/app/orders">
          <s-button variant="plain">View All Orders →</s-button>
        </s-link>
      </s-section>

      {/* Recent Shipments */}
      <s-section heading="Recent Shipments">
        {recentShipments.length === 0 ? (
          <s-text variant="subdued">No shipments yet</s-text>
        ) : (
          <s-box>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Order</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map(shipment => (
                  <tr key={shipment.id} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                    <td style={{ padding: '8px' }}>
                      <s-text fontWeight="semibold">#{shipment.shopifyOrderNumber}</s-text>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <s-badge tone={
                        shipment.status === 'completed' ? 'success' :
                        shipment.status === 'in_transit' ? 'warning' :
                        shipment.status === 'error' ? 'critical' : 'info'
                      }>
                        {getStatusLabel(shipment.status)}
                      </s-badge>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <s-text variant="subdued">
                        {new Date(shipment.createdAt).toLocaleDateString()}
                      </s-text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        )}
      </s-section>

      {/* Sidebar */}
      <s-section slot="aside" heading="Quick Actions">
        <s-stack direction="block" gap="tight">
          <s-link href="/app/orders">
            <s-button style={{ width: '100%' }}>View Orders</s-button>
          </s-link>
          <s-link href="/app/settings">
            <s-button variant="secondary" style={{ width: '100%' }}>Settings</s-button>
          </s-link>
          <s-link href="/app/logs">
            <s-button variant="secondary" style={{ width: '100%' }}>View Logs</s-button>
          </s-link>
        </s-stack>
      </s-section>

      {recentLogs.length > 0 && (
        <s-section slot="aside" heading="Recent Issues">
          <s-stack direction="block" gap="tight">
            {recentLogs.map(log => (
              <s-box key={log.id} padding="tight" borderWidth="base" borderRadius="base">
                <s-badge tone={log.level === 'error' ? 'critical' : 'warning'} size="small">
                  {log.level}
                </s-badge>
                <s-text style={{ fontSize: '12px', marginTop: '4px' }}>{log.message}</s-text>
              </s-box>
            ))}
          </s-stack>
          <s-link href="/app/logs">
            <s-button variant="plain" size="slim">View All Logs</s-button>
          </s-link>
        </s-section>
      )}

      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link href="https://portal.delifast.ae" target="_blank">
              Delifast Portal
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://github.com/mojahed4e/delifast-shopify" target="_blank">
              Documentation
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
