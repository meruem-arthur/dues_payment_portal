import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DepartmentAdminClient } from "@/components/departments/department-admin-client";

export default async function DepartmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") redirect("/dashboard");

  const [departments, sessions] = await Promise.all([
    prisma.department.findMany({
      include: { academicSession: true, _count: { select: { students: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.academicSession.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const serialized = departments.map((d) => ({
    ...d,
    fresherAmount: Number(d.fresherAmount),
    continuingAmount: Number(d.continuingAmount),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Departments</h1>
      <DepartmentAdminClient departments={serialized as any} sessions={sessions as any} />
    </div>
  );
}
