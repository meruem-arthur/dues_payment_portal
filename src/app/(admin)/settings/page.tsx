import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="bg-gradient-to-r from-admin-accent to-fuchsia-400 bg-clip-text text-2xl font-extrabold uppercase tracking-tight text-transparent">
          Account Settings
        </h1>
        <p className="text-sm text-admin-muted">
          Signed in as {user.name} ({user.email})
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Change password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
