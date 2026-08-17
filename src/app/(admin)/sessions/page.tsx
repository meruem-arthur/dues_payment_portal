import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SessionAdminClient } from "@/components/sessions/session-admin-client";

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") redirect("/dashboard");

  const sessions = await prisma.academicSession.findMany({
    include: { _count: { select: { departments: true, students: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Academic Sessions</h1>
      <SessionAdminClient sessions={sessions as any} />
    </div>
  );
}
