import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StudentManager } from "@/components/students/student-manager";
import { DepartmentSwitcher } from "@/components/students/department-switcher";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: { departmentId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  let departmentId: string | undefined;
  let departments: { id: string; name: string; academicSessionId: string }[] = [];

  if (user.role === "SUPER_ADMIN") {
    departments = await prisma.department.findMany({
      select: { id: true, name: true, academicSessionId: true },
      orderBy: { name: "asc" },
    });
    departmentId = searchParams.departmentId ?? departments[0]?.id;
  } else {
    departmentId = user.departmentId;
  }

  const activeDept = departmentId
    ? await prisma.department.findUnique({ where: { id: departmentId }, select: { academicSessionId: true } })
    : null;

  if (!activeDept) {
    return <p className="text-muted">No department available yet. Ask a Super Admin to create one.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Students</h1>
        {user.role === "SUPER_ADMIN" && <DepartmentSwitcher departments={departments} activeId={departmentId!} />}
      </div>
      <StudentManager departmentId={departmentId} academicSessionId={activeDept.academicSessionId} />
    </div>
  );
}
