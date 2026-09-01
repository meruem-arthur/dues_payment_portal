import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { NotificationFailure } from "@/lib/notification-failures";

const CHANNEL_LABEL: Record<string, string> = { EMAIL: "Email", SMS: "SMS" };

/**
 * Rendered at the top of the dashboard when getRecentNotificationFailures()
 * returns anything. Deliberately server-rendered (no polling) - it's meant
 * to be seen the moment an admin opens the dashboard, not to page them in
 * real time. See notification-failures.ts for the scoping rules.
 */
export function NotificationFailuresAlert({
  failures,
  showDepartmentName,
}: {
  failures: NotificationFailure[];
  showDepartmentName: boolean;
}) {
  if (failures.length === 0) return null;

  const emailCount = failures.filter((f) => f.channel === "EMAIL").length;
  const smsCount = failures.filter((f) => f.channel === "SMS").length;

  return (
    <div className="admin-card rounded-xl border-amber-500/30 bg-amber-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-semibold text-amber-200">
              {failures.length} notification{failures.length === 1 ? "" : "s"} failed to send in the last 24 hours
            </p>
            <p className="text-sm text-amber-200/70">
              {emailCount > 0 && <>{emailCount} email{emailCount === 1 ? "" : "s"}</>}
              {emailCount > 0 && smsCount > 0 && ", "}
              {smsCount > 0 && <>{smsCount} SMS</>}
              {" "}— students may not have received their payment receipts.
            </p>
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {failures.slice(0, 10).map((f) => (
              <div key={f.id} className="rounded-lg border border-amber-500/20 bg-black/20 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-amber-100">
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-medium">{CHANNEL_LABEL[f.channel] ?? f.channel}</span>
                  <span className="text-amber-200/80">{f.recipient}</span>
                  {showDepartmentName && <span className="text-amber-200/50">· {f.departmentName}</span>}
                  <span className="ml-auto text-amber-200/50">{formatRelativeTime(f.createdAt)}</span>
                </div>
                {f.errorMessage && <p className="mt-1 truncate text-amber-200/60" title={f.errorMessage}>{f.errorMessage}</p>}
              </div>
            ))}
          </div>

          {failures.length > 10 && (
            <p className="text-xs text-amber-200/50">+ {failures.length - 10} more</p>
          )}

          <Link href="/students" className="inline-block text-xs font-medium text-amber-300 hover:text-amber-200 hover:underline">
            Check department settings for the affected provider →
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
