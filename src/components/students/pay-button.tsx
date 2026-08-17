"use client";

import { useState } from "react";

export function PayButton({
  departmentSlug,
  paymentType,
}: {
  departmentSlug: string;
  paymentType: "FRESHER" | "CONTINUING";
}) {
  const [open, setOpen] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/payments/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentSlug, paymentType, referenceNumber, phone, email: email || undefined }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    window.location.href = data.authorizationUrl;
  }

  if (!open) {
    return (
      <button className="portal-btn-primary w-full" onClick={() => setOpen(true)}>
        Pay Now
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div>
        <label className="text-sm text-muted">Reference Number</label>
        <input required className="portal-input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
      </div>
      <div>
        <label className="text-sm text-muted">Phone Number</label>
        <input required className="portal-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="text-sm text-muted">Email (optional)</label>
        <input className="portal-input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="button" className="portal-btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" disabled={loading} className="portal-btn-primary flex-1">
          {loading ? "Redirecting..." : "Continue to Pay"}
        </button>
      </div>
    </form>
  );
}
