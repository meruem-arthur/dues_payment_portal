// Next.js calls register() once when a new server instance starts, on
// both the Node.js and Edge runtimes. This is how sentry.server.config.ts
// and sentry.edge.config.ts actually get loaded - see captureError() in
// src/lib/monitoring/capture-error.ts for where they're used.
//
// Deliberately server + edge only (API routes, webhooks, middleware) -
// these are where things previously only went to console.error with no
// alerting. Browser-side error tracking is a separate, later addition.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
