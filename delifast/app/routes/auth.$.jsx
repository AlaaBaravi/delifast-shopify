import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, registerWebhooks } from "../shopify.server";

export const loader = async ({ request }) => {
  // authenticate.admin returns an object that includes the session
  const { session } = await authenticate.admin(request);

  // ✅ Register (or update) webhooks for THIS shop
  // This makes sure every store that installs your app gets the webhooks automatically.
  await registerWebhooks({ session });

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
