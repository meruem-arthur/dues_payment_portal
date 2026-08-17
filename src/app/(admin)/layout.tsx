import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  return (
    <div className="admin-shell flex">
      <AdminSidebar userName={user.name} role={user.role} />
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}
