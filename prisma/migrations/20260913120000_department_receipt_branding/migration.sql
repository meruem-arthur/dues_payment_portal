-- Receipt branding for the PDF receipt attached to payment confirmation
-- emails (see src/lib/receipts-pdf.ts): a department stamp plus two
-- signatures (Financial Secretary, President), each with an optional
-- printed name/title under the signature image. Stored as data URLs, same
-- convention as departments.logoUrl - all nullable, a receipt simply
-- omits whichever piece a department hasn't uploaded yet.

ALTER TABLE "departments"
  ADD COLUMN "stampUrl" TEXT,
  ADD COLUMN "financialSecretaryName" TEXT,
  ADD COLUMN "financialSecretarySignatureUrl" TEXT,
  ADD COLUMN "presidentName" TEXT,
  ADD COLUMN "presidentSignatureUrl" TEXT;
