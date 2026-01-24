import { rateLimiter } from "hono-rate-limiter"

// Rate limiting middleware for public API
// Limits requests per IP address: 100 requests per hour
export const publicRateLimit = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 100,
  keyGenerator: (c) => {
    return c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown"
  },
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests. Please try again later.",
  },
})
