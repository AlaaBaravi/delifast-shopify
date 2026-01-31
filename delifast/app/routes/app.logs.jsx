/**
 * Logs Page
 * View activity logs for debugging and monitoring
 */

import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const level = url.searchParams.get('level');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const logs = await logger.getLogs(shop, { level, limit, offset });
  const total = await logger.getLogCount(shop, level);

  // Get counts by level
  const [debugCount, infoCount, warningCount, errorCount] = await Promise.all([
    logger.getLogCount(shop, 'debug'),
    logger.getLogCount(shop, 'info'),
    logger.getLogCount(shop, 'warning'),
    logger.getLogCount(shop, 'error'),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    levelCounts: {
      all: debugCount + infoCount + warningCount + errorCount,
      debug: debugCount,
      info: infoCount,
      warning: warningCount,
      error: errorCount,
    },
    currentLevel: level,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'clear_logs') {
    const daysToKeep = parseInt(formData.get('daysToKeep') || '7');
    const count = await logger.clearOldLogs(shop, daysToKeep);
    return { success: true, message: `Cleared ${count} old logs` };
  }

  return { success: false, message: 'Unknown action' };
};

export default function Logs() {
  const { logs, total, page, limit, totalPages, levelCounts, currentLevel } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isLoading = fetcher.state !== 'idle';
  const actionData = fetcher.data;

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
    } else if (actionData?.success === false) {
      shopify.toast.show(actionData.message, { isError: true });
    }
  }, [actionData, shopify]);

  const handleClearLogs = () => {
    if (confirm('Clear logs older than 7 days?')) {
      const form = new FormData();
      form.set('_action', 'clear_logs');
      form.set('daysToKeep', '7');
      fetcher.submit(form, { method: 'POST' });
    }
  };

  const getLevelBadge = (level) => {
    const tones = {
      debug: 'info',
      info: 'info',
      warning: 'warning',
      error: 'critical',
    };
    return <s-badge tone={tones[level] || 'info'}>{level}</s-badge>;
  };

  const formatContext = (context) => {
    if (!context) return null;
    try {
      const parsed = JSON.parse(context);
      return (
        <pre style={{
          margin: 0,
          fontSize: '12px',
          background: 'var(--p-color-bg-subdued)',
          padding: '8px',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '100px',
        }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <s-text variant="subdued">{context}</s-text>;
    }
  };

  return (
    <s-page heading="Activity Logs">
      <s-button slot="primary-action" onClick={handleClearLogs} disabled={isLoading}>
        Clear Old Logs
      </s-button>

      {/* Level Filters */}
      <s-section>
        <s-stack direction="inline" gap="tight">
          <s-link href="/app/logs">
            <s-badge tone={!currentLevel ? 'info' : undefined}>All ({levelCounts.all})</s-badge>
          </s-link>
          <s-link href="/app/logs?level=info">
            <s-badge tone={currentLevel === 'info' ? 'info' : undefined}>Info ({levelCounts.info})</s-badge>
          </s-link>
          <s-link href="/app/logs?level=warning">
            <s-badge tone={currentLevel === 'warning' ? 'warning' : undefined}>Warning ({levelCounts.warning})</s-badge>
          </s-link>
          <s-link href="/app/logs?level=error">
            <s-badge tone={currentLevel === 'error' ? 'critical' : undefined}>Error ({levelCounts.error})</s-badge>
          </s-link>
          <s-link href="/app/logs?level=debug">
            <s-badge tone={currentLevel === 'debug' ? 'info' : undefined}>Debug ({levelCounts.debug})</s-badge>
          </s-link>
        </s-stack>
      </s-section>

      {/* Logs Table */}
      <s-section>
        {logs.length === 0 ? (
          <s-empty-state heading="No logs found">
            <s-paragraph>
              Activity logs will appear here as the app processes orders and interacts with Delifast.
            </s-paragraph>
          </s-empty-state>
        ) : (
          <s-box>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', width: '150px' }}>Time</th>
                  <th style={{ padding: '12px', textAlign: 'left', width: '80px' }}>Level</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <s-text variant="subdued" style={{ fontSize: '12px' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </s-text>
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      {getLevelBadge(log.level)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <s-text>{log.message}</s-text>
                      {log.context && (
                        <div style={{ marginTop: '8px' }}>
                          {formatContext(log.context)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <s-stack direction="inline" gap="tight" style={{ padding: '16px', justifyContent: 'center' }}>
                {page > 1 && (
                  <s-link href={`/app/logs?page=${page - 1}${currentLevel ? `&level=${currentLevel}` : ''}`}>
                    <s-button variant="plain">Previous</s-button>
                  </s-link>
                )}
                <s-text>Page {page} of {totalPages}</s-text>
                {page < totalPages && (
                  <s-link href={`/app/logs?page=${page + 1}${currentLevel ? `&level=${currentLevel}` : ''}`}>
                    <s-button variant="plain">Next</s-button>
                  </s-link>
                )}
              </s-stack>
            )}
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="Summary">
        <s-stack direction="block" gap="tight">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>Total logs:</s-text>
            <s-text fontWeight="semibold">{levelCounts.all}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>Errors:</s-text>
            <s-text fontWeight="semibold" tone="critical">{levelCounts.error}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>Warnings:</s-text>
            <s-text fontWeight="semibold" tone="warning">{levelCounts.warning}</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app">Dashboard</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/orders">Orders</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/settings">Settings</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
