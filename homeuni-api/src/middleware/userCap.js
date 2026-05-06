import { query } from '../db/pool.js';

const COST_CAP = parseFloat(process.env.USER_COST_CAP_USD || '2.00');
const REQUEST_CAP = parseInt(process.env.USER_REQUEST_CAP || '50', 10);

async function getMonthlyUsage(userId) {
  const { rows: [row] } = await query(
    `SELECT
       COALESCE(SUM(cost_usd), 0) AS total_cost,
       COUNT(*) AS total_requests
     FROM agent_traces
     WHERE user_id = $1
       AND created_at >= date_trunc('month', NOW())`,
    [userId]
  );
  return {
    cost: parseFloat(row.total_cost),
    requests: parseInt(row.total_requests, 10),
  };
}

export async function userCap(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return next();

  try {
    const { cost, requests } = await getMonthlyUsage(userId);
    if (cost >= COST_CAP) {
      return res.status(402).json({
        error: `Monthly spending limit of $${COST_CAP.toFixed(2)} reached. Resets at the start of next month.`,
        capType: 'cost',
      });
    }
    if (requests >= REQUEST_CAP) {
      return res.status(429).json({
        error: `Monthly request limit of ${REQUEST_CAP} AI interactions reached. Resets at the start of next month.`,
        capType: 'requests',
      });
    }
  } catch (err) {
    console.error('[UserCap] DB error, failing open:', err.message);
  }

  next();
}

export async function checkUserCap(userId) {
  try {
    const { cost, requests } = await getMonthlyUsage(userId);
    if (cost >= COST_CAP) return { allowed: false, reason: 'cost' };
    if (requests >= REQUEST_CAP) return { allowed: false, reason: 'requests' };
  } catch (err) {
    console.error('[UserCap] DB error, failing open:', err.message);
  }
  return { allowed: true };
}
