/**
 * Settings Page
 * Configure Delifast credentials, sender info, and shipping defaults
 */

import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { getAvailableCities } from "../utils/cityMapping";

// ✅ SERVER-ONLY: keep it INSIDE loader/action (no top-level server imports)
export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const prisma = (await import("../db.server")).default;

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get or create store settings
  let settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: { shop },
    });
  }

  // Don't send password to client, just indicate if it's set
  const hasPassword = !!settings.delifastPassword;

  return {
    settings: {
      ...settings,
      delifastPassword: hasPassword ? "********" : "",
      hasPassword,
    },
    cities: getAvailableCities(),
  };
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const prisma = (await import("../db.server")).default;

  // These are server-only modules, dynamically imported inside action to avoid client bundling
  const { encrypt } = await import("../services/encryption.server");
  const { testConnection } = await import("../services/delifastClient.server");

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "test_connection") {
    try {
      const result = await testConnection(shop);
      return { success: true, message: "Connection successful!", result };
    } catch (error) {
      return { success: false, message: error?.message || "Connection failed" };
    }
  }

  // Update settings
  const tab = formData.get("tab");
  const updates = {};

  if (tab === "general" || !tab) {
    updates.delifastUsername = formData.get("delifastUsername") || null;

    // Only update password if changed (not the placeholder)
    const newPassword = formData.get("delifastPassword");
    if (newPassword && newPassword !== "********") {
      updates.delifastPassword = encrypt(newPassword);
    }

    updates.delifastCustomerId = formData.get("delifastCustomerId") || null;
    updates.mode = formData.get("mode") || "manual";
    updates.autoSendStatus = formData.get("autoSendStatus") || "paid";
  }

  if (tab === "sender") {
    updates.senderNo = formData.get("senderNo") || null;
    updates.senderName = formData.get("senderName") || null;
    updates.senderAddress = formData.get("senderAddress") || null;
    updates.senderMobile = formData.get("senderMobile") || null;
    updates.senderCityId = formData.get("senderCityId")
      ? parseInt(formData.get("senderCityId"), 10)
      : null;
    updates.senderAreaId = formData.get("senderAreaId")
      ? parseInt(formData.get("senderAreaId"), 10)
      : null;
  }

  if (tab === "shipping") {
    updates.defaultWeight = formData.get("defaultWeight")
      ? parseFloat(formData.get("defaultWeight"))
      : 1.0;

    updates.defaultDimensions = formData.get("defaultDimensions") || "10x10x10";

    updates.defaultCityId = formData.get("defaultCityId")
      ? parseInt(formData.get("defaultCityId"), 10)
      : 5;

    updates.paymentMethodId = formData.get("paymentMethodId")
      ? parseInt(formData.get("paymentMethodId"), 10)
      : 0;

    updates.feesOnSender = formData.get("feesOnSender") === "true";
    updates.feesPaid = formData.get("feesPaid") === "true";
  }

  await prisma.storeSettings.update({
    where: { shop },
    data: updates,
  });

  return { success: true, message: "Settings saved successfully!" };
};

export default function Settings() {
  const { settings, cities } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState(settings);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
    } else if (actionData?.success === false) {
      shopify.toast.show(actionData.message, { isError: true });
    }
  }, [actionData, shopify]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (tab) => {
    const form = new FormData();
    form.set("tab", tab);

    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        form.set(key, String(value));
      }
    });

    fetcher.submit(form, { method: "POST" });
  };

  const handleTestConnection = () => {
    const form = new FormData();
    form.set("_action", "test_connection");
    fetcher.submit(form, { method: "POST" });
  };

  const tabs = ["General", "Sender", "Shipping"];

  return (
    <s-page heading="Delifast Settings">
      <s-tabs selected={activeTab} onSelect={(index) => setActiveTab(index)}>
        {tabs.map((tab, index) => (
          <s-tab key={index}>{tab}</s-tab>
        ))}
      </s-tabs>

      {activeTab === 0 && (
        <s-section heading="General Settings">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Delifast Username"
              value={formData.delifastUsername || ""}
              onChange={(e) =>
                handleInputChange("delifastUsername", e.target.value)
              }
              helpText="Your Delifast portal login username"
            />
            <s-text-field
              label="Delifast Password"
              type="password"
              value={formData.delifastPassword || ""}
              onChange={(e) =>
                handleInputChange("delifastPassword", e.target.value)
              }
              helpText="Your Delifast portal password"
            />
            <s-text-field
              label="Customer ID"
              value={formData.delifastCustomerId || ""}
              onChange={(e) =>
                handleInputChange("delifastCustomerId", e.target.value)
              }
              helpText="Auto-filled after successful login (optional)"
            />

            <s-divider />

            <s-select
              label="Mode"
              value={formData.mode || "manual"}
              onChange={(e) => handleInputChange("mode", e.target.value)}
            >
              <option value="manual">Manual - Send orders manually</option>
              <option value="auto">Auto - Send orders automatically</option>
            </s-select>

            {formData.mode === "auto" && (
              <s-select
                label="Auto-send Trigger"
                value={formData.autoSendStatus || "paid"}
                onChange={(e) =>
                  handleInputChange("autoSendStatus", e.target.value)
                }
              >
                <option value="created">When order is created</option>
                <option value="paid">When order is paid</option>
                <option value="fulfilled">When order is fulfilled</option>
              </s-select>
            )}

            <s-stack direction="inline" gap="base">
              <s-button
                onClick={() => handleSubmit("general")}
                loading={isLoading}
              >
                Save General Settings
              </s-button>
              <s-button
                variant="secondary"
                onClick={handleTestConnection}
                loading={isLoading}
                disabled={!formData.delifastUsername || !formData.delifastPassword}
              >
                Test Connection
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {/* ... Repeat for Sender and Shipping Tabs ... */}

    </s-page>
  );
}

// ✅ avoid server import at top-level
export const headers = async (headersArgs) => {
  const { boundary } = await import(
    "@shopify/shopify-app-react-router/server"
  );
  return boundary.headers(headersArgs);
};
