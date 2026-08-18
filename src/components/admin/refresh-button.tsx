"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export function RefreshButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    // router.refresh() re-fetches server data in the background without a
    // way to await completion, so we hold the spinner briefly to give
    // clear feedback that the click registered.
    setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-label="Refresh"
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-admin-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:bg-white/10 hover:text-admin-text disabled:opacity-60 ${className}`}
    >
      {refreshing ? <Spinner /> : <RefreshCw size={16} />}
    </button>
  );
}
