/**
 * API Route: Check Pending Orders Job
 * Endpoint for external cron to check for stuck/pending orders
 *
 * Call this endpoint every 4 hours via cron:
 * curl -X POST https://your-app.com/api/jobs/check-pending -H "Authorization: Bearer YOUR_JOB_SECRET"
 */

import { checkAllPendingOrders } from "../services/jobs.server";
import { logger } from "../services/logger.server";

/**
 * Helper to return JSON Response (React Router v7 compatible)
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export const action = async ({ request }) => {
  // Verify the request is authorized
  const authHeader = request.headers.get("Authorization");
  const jobSecret = process.env.JOB_SECRET;

  if (jobSecret && authHeader !== `Bearer ${jobSecret}`) {
    logger.warning("Unauthorized job request: check-pending");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    logger.info("Running check-pending job via API");

    const result = await checkAllPendingOrders();

    return jsonResponse({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error?.message || "Unknown error";
    logger.error("Check pending job failed", { error: message });

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500
    );
  }
};

// Also support GET for easier testing
export const loader = async () => {
  return jsonResponse({
    endpoint: "check-pending",
    method: "POST",
    description: "Check for stuck/pending orders and mark them for attention",
    frequency: "Every 4 hours",
  });
};
