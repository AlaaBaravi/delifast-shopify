/**
 * API Route: Sync Statuses Job
 * Endpoint for external cron to trigger status synchronization
 *
 * Call this endpoint hourly via cron:
 * curl -X POST https://your-app.com/api/jobs/sync-statuses -H "Authorization: Bearer YOUR_JOB_SECRET"
 */

import { syncAllStatuses } from "../services/jobs.server";
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
  // Verify the request is authorized (use a secret token for cron jobs)
  const authHeader = request.headers.get("Authorization");
  const jobSecret = process.env.JOB_SECRET;

  if (jobSecret && authHeader !== `Bearer ${jobSecret}`) {
    logger.warning("Unauthorized job request: sync-statuses");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    logger.info("Running sync-statuses job via API");

    const result = await syncAllStatuses();

    return jsonResponse({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error?.message || "Unknown error";
    logger.error("Sync statuses job failed", { error: message });

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
    endpoint: "sync-statuses",
    method: "POST",
    description: "Synchronize shipment statuses with Delifast for all stores",
    frequency: "Hourly",
  });
};
