"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

// useSearchParams() forces this component to be client-rendered on first
// paint, which Next.js's App Router requires to sit inside a <Suspense>
// boundary (see src/app/reset-password/page.tsx) - without that, static
// generation fails at build time with "should be wrapped in a suspense
// boundary". Keeping the form in its own component is what makes that
// boundary possible without also deferring the surrounding page chrome.
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token. Please request a new one.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="portal-card space-y-4 p-8 text-left">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">{error}</p>}

      {success ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 border border-emerald-200">
          Password updated. Redirecting to sign in…
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium text-portal-text">New password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                className="portal-input pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-portal-muted hover:text-portal-text"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-portal-text">Confirm new password</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              className="portal-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retype your new password"
            />
          </div>

          <button type="submit" disabled={loading} className="portal-btn-primary flex w-full items-center justify-center gap-2">
            {loading && <Spinner />}
            {loading ? "Updating..." : "Update password"}
          </button>
        </>
      )}
    </form>
  );
}
