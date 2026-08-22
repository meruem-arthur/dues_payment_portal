import * as Sentry from "@sentry/nextjs";

/**
 * Centralized error reporting for anywhere we currently just did
 * console.error(err). Behaves identically to before (still logs to the
 * console) until SENTRY_DSN is set, at which point it also reports to
 * Sentry - so this is a safe drop-in with zero behavior change out of the
 * box, and lights up the moment a DSN is added (see sentry.*.config.ts).
 *
 * Deliberately never throws itself - a broken error reporter must never
 * take down the request that was already failing.
 */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  console.error(err);

  if (!process.env.SENTRY_DSN) return;

  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Reporting the error failed - nothing more we can safely do here.
  }
}
