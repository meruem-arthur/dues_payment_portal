"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type DepartmentOption = { id: string; name: string };

type Stats = {
  department: { id: string; name: string; slug: string };
  totalStudents: number;
  paidStudents: number;
  unpaidStudents: number;
  totalCollected: number;
  paymentProvider: string;
  paymentEnvironment: string;
  levelBreakdown: { level: string; paid: number; unpaid: number }[];
};

export function DepartmentFilterDashboard({ departments }: { departments: DepartmentOption[] }) {
  const [selectedId, setSelectedId] = useState(departments[0]?.id ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/departments/${id}/stats`);
    const data = await res.json();
    setStats(res.ok ? data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats(selectedId);
  }, [selectedId, fetchStats]);

  if (departments.length === 0) {
    return <p className="text-admin-muted">No departments yet. Create one to see stats here.</p>;
  }

  const pct = stats && stats.totalStudents > 0 ? ((stats.paidStudents / stats.totalStudents) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-admin-muted">Department:</label>
        <select
          className="admin-input max-w-xs"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-admin-muted">Loading department data...</p>}

      {!loading && stats && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total Students" value={stats.totalStudents} />
            <StatCard label="Paid" value={stats.paidStudents} accent />
            <StatCard label="Unpaid" value={stats.unpaidStudents} />
            <StatCard label="Completion" value={`${pct}%`} />
            <StatCard label="Total Collected (GHS)" value={stats.totalCollected.toLocaleString()} />
            <StatCard
              label="Payment Portal"
              value={`${stats.paymentProvider}${stats.paymentEnvironment === "TEST" ? " (Test)" : ""}`}
            />
          </div>

          <div className="admin-card-glow p-5">
            <h2 className="mb-4 text-sm font-semibold text-admin-text">Paid vs Unpaid by Level</h2>
            {stats.levelBreakdown.length === 0 ? (
              <p className="text-sm text-admin-muted">No students recorded for this department yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.levelBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2338" />
                  <XAxis dataKey="level" stroke="#9c93b3" fontSize={12} />
                  <YAxis stroke="#9c93b3" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#15111f", border: "1px solid #2a2338", borderRadius: 8 }}
                    labelStyle={{ color: "#f1eefb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#9c93b3" }} />
                  <Bar dataKey="paid" name="Paid" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="unpaid" name="Unpaid" fill="#3f3552" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="admin-card-glow p-5">
      <p className="text-sm text-admin-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-admin-accent" : "text-admin-text"}`}>{value}</p>
    </div>
  );
}
