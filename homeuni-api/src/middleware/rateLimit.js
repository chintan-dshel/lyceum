/**
 * Per-user sliding window rate limiter for chat/AI routes.
 * Must run after requireAuth (needs req.user.id).
 *
 * Limits: WINDOW_MS rolling window, MAX_REQUESTS cap.
 * Violation: 429 + Retry-After header, console warning.
 * Storage: in-memory Map, fine for single-process. Replace with Redis for multi-instance.
 */

const WINDOW_MS = 60_000;       // 1 minute
const MAX_REQUESTS = 30;         // 30 AI-touching requests per minute per user

// userId → sorted array of timestamps (ms)
const windows = new Map();

// Prune users who haven't made requests in 2× the window to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [userId, timestamps] of windows) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
      windows.delete(userId);
    }
  }
}, WINDOW_MS).unref();

export function rateLimit(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return next();

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let timestamps = windows.get(userId) || [];
  // Drop timestamps outside the current window
  timestamps = timestamps.filter(t => t > cutoff);
  timestamps.push(now);
  windows.set(userId, timestamps);

  if (timestamps.length > MAX_REQUESTS) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);

    console.warn(`[RateLimit] user=${userId.slice(0, 8)} hit limit (${timestamps.length}/${MAX_REQUESTS} in ${WINDOW_MS / 1000}s)`);

    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many requests. Please wait before sending another message.',
      retryAfterSeconds: retryAfterSec,
    });
  }

  next();
}
