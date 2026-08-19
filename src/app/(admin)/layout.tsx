import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  return (
    <div className="admin-shell flex min-h-screen flex-col md:flex-row">
      <AdminSidebar userName={user.name} role={user.role} />
      <main className="flex-1 min-w-0 overflow-x-auto p-4 sm:p-8">{children}</main>
    </div>
  );
}
