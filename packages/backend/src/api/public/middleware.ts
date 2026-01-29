import { rateLimiter } from "hono-rate-limiter";

const ipKeyGenerator = (c: { req: { header: (name: string) => string | undefined } }) =>
  c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

// Rate limiting middleware for public API
// Limits requests per IP address: 100 requests per hour
export const publicRateLimit = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 100,
  keyGenerator: ipKeyGenerator,
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests. Please try again later.",
  },
});

// Stricter rate limit for AI tools (generate-summary, generate-outline)
// 10 requests per hour per IP to limit cost and abuse
export const aiToolsRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  keyGenerator: ipKeyGenerator,
  message: {
    error: "Rate limit exceeded",
    message: "AI tool rate limit exceeded. Please try again later.",
  },
});
