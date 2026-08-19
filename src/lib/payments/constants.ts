// Shared between the initiate-payment duplicate guard
// (src/app/api/payments/initiate/route.ts) and the stale-payment sweep
// (src/app/api/payments/expire-stale/route.ts).
//
// A PENDING payment younger than this is treated as "possibly still in
// flight" and blocks a new attempt from the same student. Once it's older
// than this, the initiate guard stops counting it (so the student can
// retry even before a sweep has run), and the expiry sweep marks it
// CANCELLED so it stops cluttering the admin dashboard.
export const PENDING_PAYMENT_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours
