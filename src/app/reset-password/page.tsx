import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="portal-shell flex min-h-screen items-center justify-center px-4">
      <div className="portal-content w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <div className="portal-crest">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/school-crest.png" alt="University of Mines and Technology crest" />
          </div>
          <h1 className="text-2xl font-bold text-portal-text">Choose a new password</h1>
        </div>

        <Suspense fallback={<div className="portal-card p-8 text-sm text-portal-muted">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
