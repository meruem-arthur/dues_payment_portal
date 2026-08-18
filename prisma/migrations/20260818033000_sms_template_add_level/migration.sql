-- Update the default SMS receipt template to include the student's level
-- and a clearer name/reference/confirmation layout.
--
-- This only changes the column DEFAULT, applied to sms_configurations rows
-- created going forward. Departments that already have a SmsConfiguration
-- row keep whatever messageTemplate they were created with (or have since
-- customized) - it is NOT rewritten here to avoid silently overwriting a
-- department's own edited template.
--
-- To apply the new template to an existing department, PATCH
-- /api/departments/{id}/sms-config with the new messageTemplate value.

ALTER TABLE "sms_configurations"
  ALTER COLUMN "messageTemplate" SET DEFAULT 'Name : {name}
Ref No. : {reference}
Level : {level}
Payment confirmed for {department} dues.
Receipt No: {receipt}';
