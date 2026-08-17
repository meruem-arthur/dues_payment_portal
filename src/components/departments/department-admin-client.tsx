"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Session = { id: string; name: string };
type Department = {
  id: string;
  name: string;
  code: string;
  slug: string;
  fresherAmount: number;
  continuingAmount: number;
  academicSession: Session;
  _count: { students: number };
};

const emptyForm = {
  name: "",
  code: "",
  slug: "",
  description: "",
  academicSessionId: "",
  fresherAmount: 0,
  continuingAmount: 0,
  contactEmail: "",
  contactPhone: "",
};

export function DepartmentAdminClient({ departments, sessions }: { departments: Department[]; sessions: Session[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, academicSessionId: sessions[0]?.id ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create department");
      return;
    }
    setShowCreate(false);
    setForm({ ...emptyForm, academicSessionId: sessions[0]?.id ?? "" });
    router.refresh();
  }

  async function confirmDelete(dept: Department) {
    if (confirmText !== dept.name) return;
    await fetch(`/api/departments/${dept.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirmText }),
    });
    setDeletingId(null);
    setConfirmText("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button className="admin-btn-primary" onClick={() => setShowCreate(true)}>New Department</button>

      <div className="grid gap-4 md:grid-cols-2">
        {departments.map((d) => (
          <div key={d.id} className="admin-card space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{d.name}</h3>
              <span className="text-xs text-muted">{d.academicSession.name}</span>
            </div>
            <p className="text-sm text-muted">Code: {d.code} · Students: {d._count.students}</p>
            <p className="text-sm">Fresher: GHS {d.fresherAmount} · Continuing: GHS {d.continuingAmount}</p>
            <p className="text-xs text-muted">/d/{d.slug}</p>
            <button className="text-sm text-red-400 hover:underline" onClick={() => setDeletingId(d.id)}>
              Delete Department
            </button>

            {deletingId === d.id && (
              <div className="space-y-2 rounded-md border border-red-900 bg-red-950/40 p-3">
                <p className="text-sm text-red-300">
                  This permanently deletes {d.name}, its students, payments, receipts, and configuration. Type the
                  department name to confirm.
                </p>
                <input
                  className="admin-input"
                  placeholder={d.name}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="admin-btn-secondary" onClick={() => { setDeletingId(null); setConfirmText(""); }}>
                    Cancel
                  </button>
                  <button
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={confirmText !== d.name}
                    onClick={() => confirmDelete(d)}
                  >
                    Permanently Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitCreate} className="admin-card w-full max-w-lg space-y-3 p-6">
            <h2 className="text-lg font-semibold">New Department</h2>
            {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
              <TextField label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
              <TextField label="Slug (URL)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
              <div className="col-span-2 space-y-1">
                <label className="text-sm text-muted">Academic Session</label>
                <select
                  className="admin-input"
                  value={form.academicSessionId}
                  onChange={(e) => setForm({ ...form, academicSessionId: e.target.value })}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <TextField
                label="Fresher Amount (GHS)"
                value={String(form.fresherAmount)}
                onChange={(v) => setForm({ ...form, fresherAmount: Number(v) || 0 })}
              />
              <TextField
                label="Continuing Amount (GHS)"
                value={String(form.continuingAmount)}
                onChange={(v) => setForm({ ...form, continuingAmount: Number(v) || 0 })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="admin-btn-primary">Create Department</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-sm text-muted">{label}</label>
      <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
