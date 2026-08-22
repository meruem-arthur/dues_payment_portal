import * as Sentry from "@sentry/nextjs";

// Covers middleware.ts, which runs on the Edge runtime rather than Node -
// see sentry.server.config.ts for why this is a no-op without SENTRY_DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}
