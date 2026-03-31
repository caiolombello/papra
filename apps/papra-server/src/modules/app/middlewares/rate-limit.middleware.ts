import type { Context, Next } from 'hono';
import { createError } from '../../shared/errors/errors';

const windowMs = 60_000; // 1 minute
const maxRequests = 120; // per window per IP
const authMaxRequests = 30; // stricter for auth endpoints (OAuth flows use multiple requests)

const hitCounts = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of hitCounts) {
    if (now > value.resetAt) {
      hitCounts.delete(key);
    }
  }
}, 5 * 60_000);

function getClientIp(context: Context): string {
  return (
    context.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? context.req.header('x-real-ip')
    ?? 'unknown'
  );
}

export function createRateLimitMiddleware() {
  return async (context: Context, next: Next) => {
    const ip = getClientIp(context);
    const path = context.req.path;
    const isAuthRoute = path.startsWith('/api/auth/');
    const limit = isAuthRoute ? authMaxRequests : maxRequests;
    const key = `${ip}:${isAuthRoute ? 'auth' : 'general'}`;

    const now = Date.now();
    const entry = hitCounts.get(key);

    if (!entry || now > entry.resetAt) {
      hitCounts.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count++;
      if (entry.count > limit) {
        context.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
        throw createError({
          message: 'Too many requests',
          code: 'rate_limit.exceeded',
          statusCode: 429,
        });
      }
    }

    await next();
  };
}
