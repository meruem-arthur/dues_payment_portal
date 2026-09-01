"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-card max-w-md space-y-4 p-6">
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Password updated.
        </p>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-text">Current password</label>
        <input
          type={showPasswords ? "text" : "password"}
          required
          className="admin-input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-text">New password</label>
        <div className="relative">
          <input
            type={showPasswords ? "text" : "password"}
            required
            minLength={8}
            className="admin-input pr-10"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-admin-muted hover:text-admin-text"
            aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            tabIndex={-1}
          >
            {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-text">Confirm new password</label>
        <input
          type={showPasswords ? "text" : "password"}
          required
          minLength={8}
          className="admin-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <button type="submit" disabled={loading} className="admin-btn-primary flex w-full items-center justify-center gap-2">
        {loading && <Spinner />}
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
