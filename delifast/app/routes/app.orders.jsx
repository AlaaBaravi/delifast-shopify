/**
 * Orders Page
 * View and manage orders sent to Delifast
 */

import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import {
  getStatusLabel,
  getStatusTone,
  isTemporaryId,
} from "../utils/statusMapping";

// --------------------
// SERVER: loader
// --------------------
export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const prisma = (await import("../db.server")).default;

  // ✅ IMPORTANT: import your server functions dynamically too
  // Adjust this path to the real file that exports these functions in your project:
  // e.g. "../services/orderHandler.server" or "../services/shipments.server"
  const {
    getShipments,
  } = await import("../services/orderHandler.server");

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const { shipments, total } = await getShipments(shop, { status, limit, offset });

  // Get status counts
  const [totalCount, newCount, transitCount, completedCount, errorCount] =
    await Promise.all([
      prisma.shipment.count({ where: { shop } }),
      prisma.shipment.count({ where: { shop, status: "new" } }),
      prisma.shipment.count({ where: { shop, status: "in_transit" } }),
      prisma.shipment.count({ where: { shop, status: "completed" } }),
      prisma.shipment.count({ where: { shop, status: "error" } }),
    ]);

  return {
    shipments,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    statusCounts: {
      all: totalCount,
      new: newCount,
      in_transit: transitCount,
      completed: completedCount,
      error: errorCount,
    },
    currentStatus: status || null,
  };
};

// --------------------
// SERVER: action
// --------------------
export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");

  // ✅ IMPORTANT: server functions dynamic import
  // Adjust path to your real server file:
  const {
    refreshOrderStatus,
    updateShipmentId,
  } = await import("../services/orderHandler.server");

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("_action");
  const orderId = formData.get("orderId");

  try {
    if (actionType === "refresh_status") {
      const result = await refreshOrderStatus(shop, orderId, admin);
      return {
        success: true,
        message: `Status updated: ${getStatusLabel(result.status)}`,
      };
    }

    if (actionType === "update_shipment_id") {
      const newShipmentId = formData.get("shipmentId");
      if (!newShipmentId) {
        return { success: false, message: "Shipment ID is required" };
      }
      await updateShipmentId(shop, orderId, newShipmentId, admin);
      return { success: true, message: "Shipment ID updated successfully" };
    }

    if (actionType === "bulk_refresh") {
      const orderIds = formData.get("orderIds")?.split(",") || [];
      let updated = 0;

      for (const id of orderIds) {
        try {
          await refreshOrderStatus(shop, id, admin);
          updated++;
        } catch {
          // continue
        }
      }

      return {
        success: true,
        message: `Refreshed ${updated} of ${orderIds.length} shipments`,
      };
    }

    return { success: false, message: "Unknown action" };
  } catch (error) {
    return { success: false, message: error?.message || "Something went wrong" };
  }
};

// --------------------
// CLIENT: component
// --------------------
export default function Orders() {
  const { shipments, total, page, totalPages, statusCounts, currentStatus } =
    useLoaderData();

  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [selectedOrders, setSelectedOrders] = useState([]);
  const [updateIdModal, setUpdateIdModal] = useState(null);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
      setUpdateIdModal(null);
    } else if (actionData?.success === false) {
      shopify.toast.show(actionData.message, { isError: true });
    }
  }, [actionData, shopify]);

  const handleRefreshStatus = (orderId) => {
    const form = new FormData();
    form.set("_action", "refresh_status");
    form.set("orderId", orderId);
    fetcher.submit(form, { method: "POST" });
  };

  const handleBulkRefresh = () => {
    if (selectedOrders.length === 0) return;
    const form = new FormData();
    form.set("_action", "bulk_refresh");
    form.set("orderIds", selectedOrders.join(","));
    fetcher.submit(form, { method: "POST" });
  };

  const handleUpdateShipmentId = (orderId, newId) => {
    const form = new FormData();
    form.set("_action", "update_shipment_id");
    form.set("orderId", orderId);
    form.set("shipmentId", newId);
    fetcher.submit(form, { method: "POST" });
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const getStatusBadge = (status) => {
    const tone = getStatusTone(status);
    const label = getStatusLabel(status);
    return <s-badge tone={tone}>{label}</s-badge>;
  };

  return (
    <s-page heading="Delifast Orders">
      <s-button
        slot="primary-action"
        onClick={handleBulkRefresh}
        disabled={selectedOrders.length === 0 || isLoading}
      >
        Refresh Selected ({selectedOrders.length})
      </s-button>

      {/* Status Filters */}
      <s-section>
        <s-stack direction="inline" gap="tight">
          <s-link href="/app/orders">
            <s-badge tone={!currentStatus ? "info" : undefined}>
              All ({statusCounts.all})
            </s-badge>
          </s-link>

          <s-link href="/app/orders?status=new">
            <s-badge tone={currentStatus === "new" ? "info" : undefined}>
              New ({statusCounts.new})
            </s-badge>
          </s-link>

          <s-link href="/app/orders?status=in_transit">
            <s-badge tone={currentStatus === "in_transit" ? "info" : undefined}>
              In Transit ({statusCounts.in_transit})
            </s-badge>
          </s-link>

          <s-link href="/app/orders?status=completed">
            <s-badge tone={currentStatus === "completed" ? "info" : undefined}>
              Completed ({statusCounts.completed})
            </s-badge>
          </s-link>

          <s-link href="/app/orders?status=error">
            <s-badge tone={currentStatus === "error" ? "info" : undefined}>
              Error ({statusCounts.error})
            </s-badge>
          </s-link>
        </s-stack>
      </s-section>

      {/* Orders Table */}
      <s-section>
        {shipments.length === 0 ? (
          <s-empty-state heading="No shipments found">
            <s-paragraph>
              No orders have been sent to Delifast yet. Orders will appear here once
              they are sent either automatically (if auto mode is enabled) or manually.
            </s-paragraph>
            <s-link href="/app/settings">
              <s-button>Configure Settings</s-button>
            </s-link>
          </s-empty-state>
        ) : (
          <s-box>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                  <th style={{ padding: "12px", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(shipments.map((s) => s.shopifyOrderId));
                        } else {
                          setSelectedOrders([]);
                        }
                      }}
                      checked={selectedOrders.length === shipments.length && shipments.length > 0}
                    />
                  </th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Order</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Shipment ID</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Status</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Sent</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {shipments.map((shipment) => (
                  <tr
                    key={shipment.id}
                    style={{ borderBottom: "1px solid var(--p-color-border-subdued)" }}
                  >
                    <td style={{ padding: "12px" }}>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(shipment.shopifyOrderId)}
                        onChange={() => toggleOrderSelection(shipment.shopifyOrderId)}
                      />
                    </td>

                    <td style={{ padding: "12px" }}>
                      <s-text fontWeight="semibold">#{shipment.shopifyOrderNumber}</s-text>
                    </td>

                    <td style={{ padding: "12px" }}>
                      {shipment.isTemporaryId ? (
                        <s-stack direction="inline" gap="tight" align="center">
                          <s-text variant="subdued">{shipment.shipmentId}</s-text>
                          <s-button
                            variant="plain"
                            size="slim"
                            onClick={() => setUpdateIdModal(shipment)}
                          >
                            Update ID
                          </s-button>
                        </s-stack>
                      ) : (
                        <s-text>{shipment.shipmentId || "-"}</s-text>
                      )}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {getStatusBadge(shipment.status)}
                      {shipment.statusDetails && (
                        <s-text
                          variant="subdued"
                          style={{ display: "block", fontSize: "12px" }}
                        >
                          {shipment.statusDetails}
                        </s-text>
                      )}
                    </td>

                    <td style={{ padding: "12px" }}>
                      <s-text variant="subdued">
                        {new Date(shipment.sentAt).toLocaleDateString()}
                      </s-text>
                    </td>

                    <td style={{ padding: "12px" }}>
                      <s-button
                        variant="plain"
                        size="slim"
                        onClick={() => handleRefreshStatus(shipment.shopifyOrderId)}
                        disabled={isLoading || shipment.isTemporaryId}
                      >
                        Refresh
                      </s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <s-stack
                direction="inline"
                gap="tight"
                style={{ padding: "16px", justifyContent: "center" }}
              >
                {page > 1 && (
                  <s-link
                    href={`/app/orders?page=${page - 1}${
                      currentStatus ? `&status=${currentStatus}` : ""
                    }`}
                  >
                    <s-button variant="plain">Previous</s-button>
                  </s-link>
                )}

                <s-text>
                  Page {page} of {totalPages}
                </s-text>

                {page < totalPages && (
                  <s-link
                    href={`/app/orders?page=${page + 1}${
                      currentStatus ? `&status=${currentStatus}` : ""
                    }`}
                  >
                    <s-button variant="plain">Next</s-button>
                  </s-link>
                )}
              </s-stack>
            )}
          </s-box>
        )}
      </s-section>

      {/* Update Shipment ID Modal */}
      {updateIdModal && (
        <s-modal
          open
          heading={`Update Shipment ID for Order #${updateIdModal.shopifyOrderNumber}`}
          onClose={() => setUpdateIdModal(null)}
        >
          <s-section>
            <s-text-field
              label="New Shipment ID"
              id="newShipmentId"
              placeholder="Enter the real shipment ID from Delifast"
              helpText="Look up the shipment in Delifast portal and enter the real ID"
            />
          </s-section>

          <s-button
            slot="primary-action"
            onClick={() => {
              const input = document.getElementById("newShipmentId");
              if (input?.value) {
                handleUpdateShipmentId(updateIdModal.shopifyOrderId, input.value);
              }
            }}
          >
            Update ID
          </s-button>

          <s-button slot="secondary-action" variant="plain" onClick={() => setUpdateIdModal(null)}>
            Cancel
          </s-button>
        </s-modal>
      )}

      <s-section slot="aside" heading="Summary">
        <s-stack direction="block" gap="tight">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>Total shipments:</s-text>
            <s-text fontWeight="semibold">{total}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>In transit:</s-text>
            <s-text fontWeight="semibold">{statusCounts.in_transit}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text>Completed:</s-text>
            <s-text fontWeight="semibold">{statusCounts.completed}</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">Settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/logs">Activity Logs</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://portal.delifast.ae" target="_blank">
              Delifast Portal
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

// ✅ headers: avoid server import at top-level
export const headers = async (headersArgs) => {
  const { boundary } = await import("@shopify/shopify-app-react-router/server");
  return boundary.headers(headersArgs);
};
