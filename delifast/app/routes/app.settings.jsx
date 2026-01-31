/**
 * Settings Page
 * Configure Delifast credentials, sender info, and shipping defaults
 */

import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

// IMPORTANT: server-only exports live here
export { loader, action, headers } from "./app.settings.server";

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

      {activeTab === 1 && (
        <s-section heading="Sender Settings">
          <s-paragraph>
            Sender information is automatically populated from your Delifast
            account after login. You can also manually configure it here.
          </s-paragraph>

          <s-stack direction="block" gap="base">
            <s-text-field
              label="Sender Number"
              value={formData.senderNo || ""}
              onChange={(e) => handleInputChange("senderNo", e.target.value)}
              helpText="Your Delifast sender/customer number"
            />
            <s-text-field
              label="Sender Name"
              value={formData.senderName || ""}
              onChange={(e) => handleInputChange("senderName", e.target.value)}
            />
            <s-text-field
              label="Sender Address"
              value={formData.senderAddress || ""}
              onChange={(e) => handleInputChange("senderAddress", e.target.value)}
              multiline
            />
            <s-text-field
              label="Mobile Number"
              value={formData.senderMobile || ""}
              onChange={(e) => handleInputChange("senderMobile", e.target.value)}
            />
            <s-select
              label="City"
              value={formData.senderCityId || ""}
              onChange={(e) => handleInputChange("senderCityId", e.target.value)}
            >
              <option value="">Select a city</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </s-select>

            <s-text-field
              label="Area ID"
              value={formData.senderAreaId || ""}
              onChange={(e) => handleInputChange("senderAreaId", e.target.value)}
              helpText="Delifast area ID for your location"
            />

            <s-button onClick={() => handleSubmit("sender")} loading={isLoading}>
              Save Sender Settings
            </s-button>
          </s-stack>
        </s-section>
      )}

      {activeTab === 2 && (
        <s-section heading="Shipping Settings">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Default Weight (kg)"
              type="number"
              step="0.1"
              value={formData.defaultWeight || 1.0}
              onChange={(e) =>
                handleInputChange("defaultWeight", e.target.value)
              }
            />
            <s-text-field
              label="Default Dimensions"
              value={formData.defaultDimensions || "10x10x10"}
              onChange={(e) =>
                handleInputChange("defaultDimensions", e.target.value)
              }
              helpText="Format: LxWxH in cm (e.g., 10x10x10)"
            />
            <s-select
              label="Default Destination City"
              value={formData.defaultCityId || 5}
              onChange={(e) =>
                handleInputChange("defaultCityId", e.target.value)
              }
              helpText="Used when customer city cannot be determined"
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </s-select>

            <s-select
              label="Payment Method"
              value={formData.paymentMethodId || 0}
              onChange={(e) =>
                handleInputChange("paymentMethodId", e.target.value)
              }
            >
              <option value="0">COD - Cash on Delivery</option>
              <option value="1">Prepaid</option>
            </s-select>

            <s-checkbox
              checked={!!formData.feesOnSender}
              onChange={(e) => handleInputChange("feesOnSender", e.target.checked)}
            >
              Shipping fees on sender (for prepaid orders)
            </s-checkbox>

            <s-checkbox
              checked={!!formData.feesPaid}
              onChange={(e) => handleInputChange("feesPaid", e.target.checked)}
            >
              Shipping fees already paid
            </s-checkbox>

            <s-button
              onClick={() => handleSubmit("shipping")}
              loading={isLoading}
            >
              Save Shipping Settings
            </s-button>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Connection Status">
        {settings.apiToken ? (
          <s-banner tone="success">
            <s-text>Connected to Delifast</s-text>
            {settings.tokenExpiry && (
              <s-text variant="subdued">
                Token expires: {new Date(settings.tokenExpiry).toLocaleString()}
              </s-text>
            )}
          </s-banner>
        ) : (
          <s-banner tone="warning">
            <s-text>
              Not connected. Please enter credentials and test connection.
            </s-text>
          </s-banner>
        )}
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
