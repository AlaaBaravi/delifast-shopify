/**
 * API Route: Sync Statuses Job
 * Endpoint for external cron to trigger status synchronization
 *
 * Call this endpoint hourly via cron:
 * curl -X POST https://your-app.com/api/jobs/sync-statuses -H "Authorization: Bearer YOUR_JOB_SECRET"
 */

import { json } from "react-router";
import { syncAllStatuses } from "../services/jobs.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // Verify the request is authorized (use a secret token for cron jobs)
  const authHeader = request.headers.get('Authorization');
  const jobSecret = process.env.JOB_SECRET;

  if (jobSecret && authHeader !== `Bearer ${jobSecret}`) {
    logger.warning('Unauthorized job request: sync-statuses');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Running sync-statuses job via API');

    const result = await syncAllStatuses();

    return json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Sync statuses job failed', { error: error.message });

    return json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
};

// Also support GET for easier testing
export const loader = async ({ request }) => {
  return json({
    endpoint: 'sync-statuses',
    method: 'POST',
    description: 'Synchronize shipment statuses with Delifast for all stores',
    frequency: 'Hourly',
  });
};
