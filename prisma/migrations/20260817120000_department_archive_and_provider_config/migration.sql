-- Phase 2: department configuration
--
-- 1. Departments gain a status (ACTIVE/ARCHIVED) instead of ever being
--    hard-deleted. "Deleting" a department in the app now archives it.
-- 2. PaymentProviderConfiguration gains a generic `configValue` column for
--    provider-specific config (e.g. a Hubtel POS Sales ID, a Paystack
--    subaccount code) that only the matching adapter in src/lib/payments
--    interprets.
-- 3. Every foreign key from a child table to `departments` is changed from
--    ON DELETE CASCADE to ON DELETE RESTRICT. Financial and audit history
--    must never disappear as a side effect of removing a department, and
--    this makes that true at the database level, not just in application
--    code.

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable: departments
ALTER TABLE "departments" ADD COLUMN "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "departments" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable: payment_provider_configurations
ALTER TABLE "payment_provider_configurations" ADD COLUMN "configValue" TEXT;

-- AlterTable: users (display/reference username, separate from email login)
ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Drop and recreate the department foreign keys as RESTRICT instead of CASCADE.
ALTER TABLE "students" DROP CONSTRAINT "students_departmentId_fkey";
ALTER TABLE "students" ADD CONSTRAINT "students_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT "payments_departmentId_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipts" DROP CONSTRAINT "receipts_departmentId_fkey";
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_provider_configurations" DROP CONSTRAINT "payment_provider_configurations_departmentId_fkey";
ALTER TABLE "payment_provider_configurations" ADD CONSTRAINT "payment_provider_configurations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sms_configurations" DROP CONSTRAINT "sms_configurations_departmentId_fkey";
ALTER TABLE "sms_configurations" ADD CONSTRAINT "sms_configurations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_configurations" DROP CONSTRAINT "email_configurations_departmentId_fkey";
ALTER TABLE "email_configurations" ADD CONSTRAINT "email_configurations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_departmentId_fkey";
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_departmentId_fkey";
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_departmentId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
