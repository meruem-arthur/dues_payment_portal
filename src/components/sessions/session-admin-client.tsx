"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SessionRow = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  _count: { departments: number; students: number };
};

export function SessionAdminClient({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startDate, endDate }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create session");
      return;
    }
    setShowCreate(false);
    setName("");
    setStartDate("");
    setEndDate("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button className="admin-btn-primary" onClick={() => setShowCreate(true)}>New Academic Session</button>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Departments</th>
              <th className="p-3">Students</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3">{s._count.departments}</td>
                <td className="p-3">{s._count.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submit} className="admin-card w-full max-w-sm space-y-3 p-6">
            <h2 className="text-lg font-semibold">New Academic Session</h2>
            {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div className="space-y-1">
              <label className="text-sm text-muted">Name (e.g. 2026/2027)</label>
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted">Start Date</label>
              <input type="date" className="admin-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted">End Date</label>
              <input type="date" className="admin-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="admin-btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
