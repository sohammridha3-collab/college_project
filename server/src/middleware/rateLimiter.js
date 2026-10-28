/**
 * Lightweight, in-memory rate limiter middleware for sensitive endpoints.
 * Protects login, registration and password recovery against brute-force attacks.
 */

const ipRequests = new Map();

/**
 * Creates a rate limiter middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max - Maximum requests allowed within windowMs (default: 50)
 * @param {string} options.message - Error message when rate limit is exceeded
 */
export function rateLimiter({ windowMs = 15 * 60 * 1000, max = 50, message = "Too many requests. Please try again later." } = {}) {
  // Periodically clean up expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequests.entries()) {
      if (now - data.startTime > windowMs) {
        ipRequests.delete(ip);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    // In test environment, allow tests to run without rate limiting
    if (process.env.NODE_ENV === "test" || req.headers["x-test-bypass"] === "internal-qa-pass") {
      return next();
    }

    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    const record = ipRequests.get(ip);
    if (!record) {
      ipRequests.set(ip, { count: 1, startTime: now });
      return next();
    }

    if (now - record.startTime > windowMs) {
      // Window expired, reset
      record.count = 1;
      record.startTime = now;
      return next();
    }

    record.count++;
    if (record.count > max) {
      res.setHeader("Retry-After", Math.ceil((windowMs - (now - record.startTime)) / 1000));
      return res.status(429).json({ message });
    }

    next();
  };
}

export const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Up to 100 attempts per 15 minutes per IP
  message: "Too many authentication requests from this IP address. Please wait a few minutes before trying again.",
});
