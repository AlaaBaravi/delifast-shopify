import prisma from "../db.server";
import { encrypt } from "../services/encryption.server";
import { testConnection } from "../services/delifastClient.server";
import { authenticate } from "../shopify.server";
import { getAvailableCities } from "../utils/cityMapping";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.storeSettings.findUnique({ where: { shop } });

  if (!settings) {
    settings = await prisma.storeSettings.create({ data: { shop } });
  }

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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "test_connection") {
    try {
      await testConnection(shop);
      return { success: true, message: "Connection successful!" };
    } catch (error) {
      return { success: false, message: error?.message || "Connection failed" };
    }
  }

  const tab = formData.get("tab");
  const updates = {};

  if (tab === "general" || !tab) {
    updates.delifastUsername = formData.get("delifastUsername") || null;

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

    updates.defaultDimensions =
      formData.get("defaultDimensions") || "10x10x10";

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

export const headers = (headersArgs) => boundary.headers(headersArgs);
