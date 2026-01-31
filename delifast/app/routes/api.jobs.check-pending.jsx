/**
 * API Route: Check Pending Orders Job
 * Endpoint for external cron to check for stuck/pending orders
 *
 * Call this endpoint every 4 hours via cron:
 * curl -X POST https://your-app.com/api/jobs/check-pending -H "Authorization: Bearer YOUR_JOB_SECRET"
 */

import { json } from "react-router";
import { checkAllPendingOrders } from "../services/jobs.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }) => {
  // Verify the request is authorized
  const authHeader = request.headers.get('Authorization');
  const jobSecret = process.env.JOB_SECRET;

  if (jobSecret && authHeader !== `Bearer ${jobSecret}`) {
    logger.warning('Unauthorized job request: check-pending');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Running check-pending job via API');

    const result = await checkAllPendingOrders();

    return json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Check pending job failed', { error: error.message });

    return json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
};

// Also support GET for easier testing
export const loader = async ({ request }) => {
  return json({
    endpoint: 'check-pending',
    method: 'POST',
    description: 'Check for stuck/pending orders and mark them for attention',
    frequency: 'Every 4 hours',
  });
};
