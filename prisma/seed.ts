import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding development data...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const session = await prisma.academicSession.upsert({
    where: { name: "2026/2027" },
    update: {},
    create: {
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@umat.test" },
    update: {},
    create: {
      name: "Super Admin",
      email: "superadmin@umat.test",
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  const departmentsData = [
    { name: "Geomatic Engineering", code: "GESA", slug: "geomatic-engineering", fresher: 170, continuing: 70, count: 100 },
    { name: "Civil Engineering", code: "CESA", slug: "civil-engineering", fresher: 150, continuing: 60, count: 50 },
  ];

  for (const d of departmentsData) {
    const department = await prisma.department.upsert({
      where: { slug: d.slug },
      update: {},
      create: {
        name: d.name,
        code: d.code,
        slug: d.slug,
        academicSessionId: session.id,
        fresherAmount: d.fresher,
        continuingAmount: d.continuing,
        paymentConfig: { create: { provider: "PAYSTACK", environment: "TEST" } },
        smsConfig: { create: { senderId: d.code } },
        emailConfig: { create: {} },
      },
    });

    const adminEmail = `${d.slug}-admin@umat.test`;
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        name: `${d.name} Admin`,
        email: adminEmail,
        passwordHash,
        role: "DEPARTMENT_ADMIN",
        departmentId: department.id,
      },
    });

    const levels = ["L100", "L200", "L300", "L400"] as const;
    for (let i = 1; i <= d.count; i++) {
      const level = levels[i % levels.length];
      await prisma.student.upsert({
        where: {
          departmentId_academicSessionId_referenceNumber: {
            departmentId: department.id,
            academicSessionId: session.id,
            referenceNumber: `${d.code}${String(i).padStart(4, "0")}`,
          },
        },
        update: {},
        create: {
          fullName: `Test Student ${i}`,
          referenceNumber: `${d.code}${String(i).padStart(4, "0")}`,
          studentIndexNo: `${d.code}/${String(i).padStart(4, "0")}`,
          level,
          phone: `02400000${String(i).padStart(2, "0")}`,
          email: `student${i}@${d.slug}.umat.test`,
          departmentId: department.id,
          academicSessionId: session.id,
          paymentStatus: i % 3 === 0 ? "SUCCESS" : "PENDING",
        },
      });
    }

    console.log(`Seeded ${d.name}: ${d.count} students, admin login ${adminEmail}`);
  }

  console.log("Done.");
  console.log("Super admin login: superadmin@umat.test / Password123!");
  console.log("All seeded passwords: Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
