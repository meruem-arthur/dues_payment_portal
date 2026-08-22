"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Deliberately the same message whether or not the account exists -
      // see the route for why.
      setMessage(data.message ?? "If an account exists for that email, we've sent a link to reset the password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="portal-shell flex min-h-screen items-center justify-center px-4">
      <div className="portal-content w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <div className="portal-crest">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/school-crest.png" alt="University of Mines and Technology crest" />
          </div>
          <h1 className="text-2xl font-bold text-portal-text">Reset your password</h1>
          <p className="portal-text-on-photo text-base font-medium">Admin Sign In</p>
        </div>

        <form onSubmit={handleSubmit} className="portal-card space-y-4 p-8 text-left">
          <p className="text-sm text-portal-muted">
            Enter the email on your admin account and we'll send you a link to reset your password.
          </p>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">{error}</p>
          )}

          {message ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 border border-emerald-200">
              {message}
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-portal-text">Email</label>
                <input
                  type="email"
                  required
                  className="portal-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@umat.edu.gh"
                />
              </div>

              <button type="submit" disabled={loading} className="portal-btn-primary flex w-full items-center justify-center gap-2">
                {loading && <Spinner />}
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </>
          )}

          <div className="text-center">
            <a href="/login" className="text-sm text-portal-muted hover:text-portal-text hover:underline">
              Back to sign in
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
