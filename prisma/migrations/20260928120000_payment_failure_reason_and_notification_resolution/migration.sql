-- Two admin-visibility gaps found while investigating repeated payment
-- failures: (1) a FAILED payment recorded nothing about WHY it failed beyond
-- console/Sentry logs an admin can't easily see, and (2) the dashboard's
-- notification-failure alert had no way to be dismissed once fixed - it only
-- ever aged out of its 24h lookback window.

ALTER TABLE "payments"
  ADD COLUMN "failureReason" TEXT;

ALTER TABLE "notification_logs"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedBy" TEXT;
