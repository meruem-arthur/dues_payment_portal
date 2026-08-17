import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { DepartmentFilterDashboard } from "@/components/admin/department-filter-dashboard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    const departments = await prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Select a department to view its live payment monitoring" />

        {departments.length === 0 ? (
          <EmptyStateCard message="No departments found" ctaLabel="Create First Department" ctaHref="/departments" />
        ) : (
          <DepartmentFilterDashboard departments={departments} />
        )}
      </div>
    );
  }

  // DEPARTMENT_ADMIN — same stats endpoint, no dropdown since they only have one department.
  const departmentId = user.departmentId as string;
  const department = await prisma.department.findUnique({ where: { id: departmentId } });

  return (
    <div className="space-y-6">
      <PageHeader title={department?.name ?? "Department"} subtitle="Live payment monitoring & control" />
      <DepartmentFilterDashboard departments={department ? [{ id: department.id, name: department.name }] : []} />
      <Link href="/students" className="admin-btn-secondary">Manage Students</Link>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="bg-gradient-to-r from-admin-accent to-fuchsia-400 bg-clip-text text-2xl font-extrabold uppercase tracking-tight text-transparent">
          {title}
        </h1>
        <p className="text-sm text-admin-muted">{subtitle}</p>
      </div>
      <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2338] text-admin-muted hover:text-admin-text">
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

function EmptyStateCard({ message, ctaLabel, ctaHref }: { message: string; ctaLabel: string; ctaHref: string }) {
  return (
    <div className="admin-card-glow flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-admin-muted">{message}</p>
      <Link href={ctaHref} className="admin-btn-primary">{ctaLabel}</Link>
    </div>
  );
}
