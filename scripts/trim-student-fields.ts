// One-off cleanup: trims leading/trailing whitespace on existing students'
// referenceNumber, phone, and fullName - most likely to have crept in via a
// CSV import (a spreadsheet cell with a trailing space) or manual admin
// entry, before the .trim() added to studentSchema/studentCsvRowSchema and
// the public payment-form schemas stopped it happening going forward.
//
// A whitespace-padded referenceNumber is invisible in the admin UI but
// breaks the exact-match lookup a student's own (already-trimmed) input goes
// through on the public payment form - this is what causes a seemingly valid
// reference number to fail with "no student found" or "could not initiate
// payment".
//
// Safe to run more than once - rows that are already clean are left alone,
// and this only ever removes leading/trailing whitespace, never touches
// anything else about the record.
//
// Usage (requires DATABASE_URL already set in your env):
//   npx tsx scripts/trim-student-fields.ts

import { prisma } from "../src/lib/db";

async function main() {
  const students = await prisma.student.findMany({
    select: { id: true, referenceNumber: true, phone: true, fullName: true },
  });

  let updated = 0;
  const changes: { id: string; field: string; before: string; after: string }[] = [];

  for (const s of students) {
    const data: { referenceNumber?: string; phone?: string; fullName?: string } = {};

    const trimmedRef = s.referenceNumber.trim();
    if (trimmedRef !== s.referenceNumber) {
      data.referenceNumber = trimmedRef;
      changes.push({ id: s.id, field: "referenceNumber", before: JSON.stringify(s.referenceNumber), after: trimmedRef });
    }

    const trimmedPhone = s.phone.trim();
    if (trimmedPhone !== s.phone) {
      data.phone = trimmedPhone;
      changes.push({ id: s.id, field: "phone", before: JSON.stringify(s.phone), after: trimmedPhone });
    }

    const trimmedName = s.fullName.trim();
    if (trimmedName !== s.fullName) {
      data.fullName = trimmedName;
      changes.push({ id: s.id, field: "fullName", before: JSON.stringify(s.fullName), after: trimmedName });
    }

    if (Object.keys(data).length > 0) {
      // A trimmed referenceNumber could theoretically collide with an
      // already-clean row for the same department+session (the unique
      // constraint on that triple) - if so, this is a genuine duplicate the
      // CSV import should have caught, not something to silently merge. Skip
      // it and report it instead of crashing the whole run.
      try {
        await prisma.student.update({ where: { id: s.id }, data });
        updated++;
      } catch (err) {
        console.error(`Skipped student ${s.id} - update failed (likely a duplicate after trimming):`, err);
      }
    }
  }

  for (const c of changes) {
    console.log(`  ${c.id} · ${c.field}: ${c.before} -> "${c.after}"`);
  }
  console.log(`\nTrimmed whitespace on ${updated} student record(s) out of ${students.length} checked.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
