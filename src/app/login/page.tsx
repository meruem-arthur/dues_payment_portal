"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });

    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="portal-shell flex min-h-screen items-center justify-center px-4">
      <div className="portal-content w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <div className="portal-crest">
            <GraduationCap size={28} />
          </div>
          <h1 className="text-2xl font-bold text-portal-text">Dues Payment Portal</h1>
          <p className="text-sm text-portal-muted">Admin Sign In</p>
        </div>

        <form onSubmit={handleSubmit} className="portal-card space-y-4 p-8 text-left">
          <p className="text-sm text-portal-muted">Welcome back! Please sign in to continue</p>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">{error}</p>
          )}

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

          <div className="space-y-1">
            <label className="text-sm font-medium text-portal-text">Password</label>
            <input
              type="password"
              required
              className="portal-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="portal-btn-primary w-full">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
