/**
 * API Route: Update Temporary IDs Job
 * Endpoint for external cron to trigger temporary ID resolution
 *
 * Call this endpoint hourly via cron:
 * curl -X POST https://your-app.com/api/jobs/update-temp-ids -H "Authorization: Bearer YOUR_JOB_SECRET"
 */

import { json } from "react-router";
import { updateAllTempIds } from "../services/jobs.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // Verify the request is authorized
  const authHeader = request.headers.get('Authorization');
  const jobSecret = process.env.JOB_SECRET;

  if (jobSecret && authHeader !== `Bearer ${jobSecret}`) {
    logger.warning('Unauthorized job request: update-temp-ids');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Running update-temp-ids job via API');

    const result = await updateAllTempIds();

    return json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Update temp IDs job failed', { error: error.message });

    return json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
};

// Also support GET for easier testing
export const loader = async ({ request }) => {
  return json({
    endpoint: 'update-temp-ids',
    method: 'POST',
    description: 'Resolve temporary shipment IDs to real IDs for all stores',
    frequency: 'Hourly',
  });
};
