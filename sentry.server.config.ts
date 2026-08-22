import * as Sentry from "@sentry/nextjs";

// Only turns on when SENTRY_DSN is actually set. Without it, this file is a
// no-op and the app behaves exactly as it did before Sentry was added -
// nothing about deploying this requires a Sentry account to exist yet.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Low sample rate - this is a low-traffic university dues portal, not a
    // high-volume consumer app. Raise it later if useful.
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}
