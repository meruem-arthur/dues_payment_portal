"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { CheckCircle2, Clock, Users, Wallet } from "lucide-react";

type DepartmentOption = { id: string; name: string };

type Stats = {
  department: { id: string; name: string; code: string; fresherAmount: number; continuingAmount: number };
  totals: {
    totalStudents: number;
    paidStudents: number;
    pendingStudents: number;
    totalCollected: number;
    expectedTotal: number;
  };
  paymentStatusCounts: Record<"SUCCESS" | "PENDING" | "FAILED" | "CANCELLED" | "REFUNDED", number>;
  levelBreakdown: { level: string; total: number; paid: number; pending: number }[];
  trend: { date: string; amount: number }[];
  recentPayments: {
    id: string;
    studentName: string;
    referenceNumber: string;
    amount: number;
    status: string;
    paymentType: string;
    paidAt: string | null;
    createdAt: string;
  }[];
};

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "#a855f7",
  PENDING: "#facc15",
  FAILED: "#f87171",
  CANCELLED: "#6b7280",
  REFUNDED: "#38bdf8",
};

const GHS = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 });

export function DepartmentFilterDashboard({ departments }: { departments: DepartmentOption[] }) {
  const [selectedId, setSelectedId] = useState(departments[0]?.id ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/departments/${selectedId}/stats`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load stats");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="space-y-6">
      {departments.length > 1 && (
        <select
          className="admin-input w-full max-w-xs sm:w-auto"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}

      {error && (
        <div className="admin-card border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {loading && !stats && <DashboardSkeleton />}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users size={18} />}
              label="Total Students"
              value={stats.totals.totalStudents.toLocaleString()}
            />
            <StatCard
              icon={<CheckCircle2 size={18} />}
              label="Paid"
              value={stats.totals.paidStudents.toLocaleString()}
              sub={
                stats.totals.totalStudents > 0
                  ? `${Math.round((stats.totals.paidStudents / stats.totals.totalStudents) * 100)}%`
                  : undefined
              }
            />
            <StatCard
              icon={<Clock size={18} />}
              label="Pending"
              value={stats.totals.pendingStudents.toLocaleString()}
            />
            <StatCard
              icon={<Wallet size={18} />}
              label="Collected"
              value={GHS.format(stats.totals.totalCollected)}
              sub={
                stats.totals.expectedTotal > 0
                  ? `of ${GHS.format(stats.totals.expectedTotal)} expected`
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="admin-card-glow p-5 lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-admin-text">Collections — last 14 days</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.trend}>
                  <defs>
                    <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#2a2338" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d.slice(5)}
                    tick={{ fill: "#9c93b3", fontSize: 11 }}
                    axisLine={{ stroke: "#2a2338" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#9c93b3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#15111f", border: "1px solid #2a2338", borderRadius: 8 }}
                    labelStyle={{ color: "#f1eefb" }}
                    formatter={(v: number) => [GHS.format(v), "Collected"]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#a855f7" fill="url(#collectedFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="admin-card-glow p-5">
              <h3 className="mb-4 text-sm font-semibold text-admin-text">Payment status</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={Object.entries(stats.paymentStatusCounts)
                      .filter(([, v]) => v > 0)
                      .map(([status, value]) => ({ name: status, value }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {Object.keys(stats.paymentStatusCounts).map((status) => (
                      <Cell key={status} fill={STATUS_COLORS[status]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#15111f", border: "1px solid #2a2338", borderRadius: 8, color: "#ffffff" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {Object.entries(stats.paymentStatusCounts)
                  .filter(([, v]) => v > 0)
                  .map(([status, value]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-admin-muted">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[status] }}
                        />
                        {status}
                      </span>
                      <span className="text-admin-text">{value}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="admin-card-glow p-5">
              <h3 className="mb-4 text-sm font-semibold text-admin-text">By level</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.levelBreakdown}>
                  <CartesianGrid vertical={false} stroke="#2a2338" />
                  <XAxis dataKey="level" tick={{ fill: "#9c93b3", fontSize: 11 }} axisLine={{ stroke: "#2a2338" }} tickLine={false} />
                  <YAxis tick={{ fill: "#9c93b3", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ background: "#15111f", border: "1px solid #2a2338", borderRadius: 8 }} />
                  <Bar dataKey="paid" stackId="a" fill="#a855f7" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" stackId="a" fill="#2a2338" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="admin-card-glow p-5 lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-admin-text">Recent payments</h3>
              {stats.recentPayments.length === 0 ? (
                <p className="py-8 text-center text-sm text-admin-muted">No payments yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-admin-border/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="text-admin-text">{p.studentName}</p>
                        <p className="text-xs text-admin-muted">{p.referenceNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-admin-text">{GHS.format(p.amount)}</p>
                        <p
                          className="text-xs"
                          style={{ color: STATUS_COLORS[p.status] ?? "#9c93b3" }}
                        >
                          {p.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="admin-card-glow flex items-start justify-between p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-admin-muted">{label}</p>
        <p className="mt-1.5 text-2xl font-bold text-admin-text">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-admin-muted">{sub}</p>}
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-admin-accent/15 text-admin-accent">
        {icon}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="admin-card-glow h-24 animate-pulse p-5" />
      ))}
    </div>
  );
}
