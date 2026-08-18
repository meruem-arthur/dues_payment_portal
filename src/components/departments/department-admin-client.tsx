"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

type Session = { id: string; name: string };
type Department = {
  id: string;
  name: string;
  code: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED";
  fresherAmount: number;
  continuingAmount: number;
  academicSession: Session;
  _count: { students: number };
};

type StagedStudent = {
  fullName: string;
  referenceNumber: string;
  studentIndexNo: string;
  level: "L100" | "L200" | "L300" | "L400" | "L500" | "L600";
  phone: string;
  email: string;
};

const LEVELS = ["L100", "L200", "L300", "L400", "L500", "L600"] as const;
const LEVEL_MAP: Record<string, StagedStudent["level"]> = {
  "100": "L100", "200": "L200", "300": "L300", "400": "L400", "500": "L500", "600": "L600",
  L100: "L100", L200: "L200", L300: "L300", L400: "L400", L500: "L500", L600: "L600",
};

const emptyForm = {
  name: "",
  code: "",
  academicSessionId: "",
  fresherAmount: "",
  continuingAmount: "",
  paymentProvider: "PAYSTACK" as "PAYSTACK" | "HUBTEL",
  paymentConfigValue: "",
  smsSenderId: "",
  smsMessageTemplate: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminUsername: "",
  adminPassword: "",
};

type PaymentConfig = {
  provider: "PAYSTACK" | "HUBTEL";
  environment: "TEST" | "LIVE";
  publicKey: string;
  configValue: string;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  updatedAt?: string;
};

const emptyPaymentForm = {
  provider: "PAYSTACK" as "PAYSTACK" | "HUBTEL",
  environment: "TEST" as "TEST" | "LIVE",
  publicKey: "",
  secretKey: "",
  webhookSecret: "",
  configValue: "",
};

const emptyManualStudent: StagedStudent = {
  fullName: "",
  referenceNumber: "",
  studentIndexNo: "",
  level: "L100",
  phone: "",
  email: "",
};

function generateClientPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += alphabet[Math.floor(Math.random() * alphabet.length)];
  pw = symbols[Math.floor(Math.random() * symbols.length)] + String(Math.floor(Math.random() * 10)) + pw;
  return pw;
}

export function DepartmentAdminClient({ departments, sessions }: { departments: Department[]; sessions: Session[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, academicSessionId: sessions[0]?.id ?? "" });
  const [students, setStudents] = useState<StagedStudent[]>([]);
  const [manualStudent, setManualStudent] = useState<StagedStudent>(emptyManualStudent);
  const [showManualRow, setShowManualRow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    // router.refresh() re-fetches server data in the background without a
    // way to await completion, so we hold the spinner briefly to give
    // clear feedback that the click registered.
    setTimeout(() => setRefreshing(false), 700);
  }

  // Payment settings modal - lets a Super Admin add/edit a department's
  // real Paystack (or Hubtel) credentials once the department already
  // exists, since the create-department form deliberately only collects
  // the provider + a generic config value and leaves secrets for here.
  const [paymentSettingsDept, setPaymentSettingsDept] = useState<Department | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [paymentMeta, setPaymentMeta] = useState<{ hasSecretKey: boolean; hasWebhookSecret: boolean } | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSaved, setPaymentSaved] = useState(false);

  const shown = departments.filter((d) => (tab === "active" ? d.status === "ACTIVE" : d.status === "ARCHIVED"));

  function resetForm() {
    setForm({ ...emptyForm, academicSessionId: sessions[0]?.id ?? "" });
    setStudents([]);
    setManualStudent(emptyManualStudent);
    setShowManualRow(false);
    setError(null);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const parsed: StagedStudent[] = [];
        const errors: string[] = [];
        rows.forEach((row, idx) => {
          const level = LEVEL_MAP[(row.level || "").trim()];
          if (!row.name || !row.reference_number || !row.phone || !level) {
            errors.push(`Row ${idx + 2}: missing or invalid required field`);
            return;
          }
          parsed.push({
            fullName: row.name,
            referenceNumber: row.reference_number,
            studentIndexNo: row.student_id || "",
            level,
            phone: row.phone,
            email: row.email || "",
          });
        });
        setStudents((prev) => [...prev, ...parsed]);
        if (errors.length) setError(`${parsed.length} students added. ${errors.length} row(s) skipped (bad/missing data).`);
      },
    });
    e.target.value = "";
  }

  function addManualStudent() {
    if (!manualStudent.fullName || !manualStudent.referenceNumber || !manualStudent.phone) {
      setError("Full name, reference number and phone are required to add a student");
      return;
    }
    setStudents((prev) => [...prev, manualStudent]);
    setManualStudent(emptyManualStudent);
    setShowManualRow(false);
    setError(null);
  }

  function removeStudent(idx: number) {
    setStudents((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          academicSessionId: form.academicSessionId,
          fresherAmount: Number(form.fresherAmount) || 0,
          continuingAmount: Number(form.continuingAmount) || 0,
          paymentProvider: { provider: form.paymentProvider, configValue: form.paymentConfigValue },
          sms: { senderId: form.smsSenderId, messageTemplate: form.smsMessageTemplate },
          admin: {
            name: form.adminName,
            email: form.adminEmail,
            phone: form.adminPhone,
            username: form.adminUsername,
            password: form.adminPassword,
          },
          students,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not create department");
        return;
      }
      setShowCreate(false);
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmArchive(dept: Department) {
    if (confirmText !== dept.name) return;
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", confirmName: confirmText }),
    });
    if (res.ok) {
      setArchivingId(null);
      setConfirmText("");
      router.refresh();
    }
  }

  async function restore(dept: Department) {
    await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    router.refresh();
  }

  async function openPaymentSettings(dept: Department) {
    setPaymentSettingsDept(dept);
    setPaymentForm(emptyPaymentForm);
    setPaymentMeta(null);
    setPaymentError(null);
    setPaymentSaved(false);
    setPaymentLoading(true);
    try {
      const res = await fetch(`/api/departments/${dept.id}/payment-config`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaymentError(data.error ?? "Could not load payment configuration");
        return;
      }
      const config: PaymentConfig | null = data.config;
      if (config) {
        setPaymentForm({
          provider: config.provider,
          environment: config.environment,
          publicKey: config.publicKey,
          secretKey: "",
          webhookSecret: "",
          configValue: config.configValue,
        });
        setPaymentMeta({ hasSecretKey: config.hasSecretKey, hasWebhookSecret: config.hasWebhookSecret });
      } else {
        setPaymentMeta({ hasSecretKey: false, hasWebhookSecret: false });
      }
    } finally {
      setPaymentLoading(false);
    }
  }

  function closePaymentSettings() {
    setPaymentSettingsDept(null);
    setPaymentForm(emptyPaymentForm);
    setPaymentMeta(null);
    setPaymentError(null);
    setPaymentSaved(false);
  }

  async function savePaymentSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentSettingsDept) return;
    setPaymentError(null);
    setPaymentSaved(false);
    setPaymentSaving(true);
    try {
      // Blank secret-bearing fields mean "leave unchanged" - only send the
      // ones the admin actually typed something into, so re-saving after
      // rotating just one credential can't wipe the others.
      const body: Record<string, string> = {
        provider: paymentForm.provider,
        environment: paymentForm.environment,
      };
      if (paymentForm.publicKey.trim()) body.publicKey = paymentForm.publicKey.trim();
      if (paymentForm.secretKey.trim()) body.secretKey = paymentForm.secretKey.trim();
      if (paymentForm.webhookSecret.trim()) body.webhookSecret = paymentForm.webhookSecret.trim();
      if (paymentForm.configValue.trim()) body.configValue = paymentForm.configValue.trim();

      const res = await fetch(`/api/departments/${paymentSettingsDept.id}/payment-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaymentError(data.error ?? "Could not save payment configuration");
        return;
      }
      const config: PaymentConfig = data.config;
      setPaymentForm({
        provider: config.provider,
        environment: config.environment,
        publicKey: config.publicKey,
        secretKey: "",
        webhookSecret: "",
        configValue: config.configValue,
      });
      setPaymentMeta({ hasSecretKey: config.hasSecretKey, hasWebhookSecret: config.hasWebhookSecret });
      setPaymentSaved(true);
    } finally {
      setPaymentSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "active" ? "bg-white/10 font-semibold" : "text-muted"}`}
            onClick={() => setTab("active")}
          >
            Active
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "archived" ? "bg-white/10 font-semibold" : "text-muted"}`}
            onClick={() => setTab("archived")}
          >
            Archived
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-admin-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:bg-white/10 hover:text-admin-text disabled:opacity-60"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh departments"
            type="button"
          >
            {refreshing ? <Spinner /> : <RefreshCw size={16} />}
          </button>
          <button className="admin-btn-primary" onClick={() => setShowCreate(true)}>New Department</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {shown.length === 0 && <p className="text-sm text-muted">No {tab} departments.</p>}
        {shown.map((d) => (
          <div key={d.id} className="admin-card space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{d.name}</h3>
              <span className="text-xs text-muted">{d.academicSession.name}</span>
            </div>
            <p className="text-sm text-muted">Code: {d.code} · Students: {d._count.students}</p>
            <p className="text-sm">Fresher: GHS {d.fresherAmount} · Continuing: GHS {d.continuingAmount}</p>
            <p className="text-xs text-muted">/d/{d.slug}</p>

            <div className="flex flex-wrap items-center gap-3">
              <button className="text-sm text-sky-400 hover:underline" onClick={() => openPaymentSettings(d)}>
                Payment Settings
              </button>

              {d.status === "ACTIVE" ? (
                <button className="text-sm text-red-400 hover:underline" onClick={() => setArchivingId(d.id)}>
                  Archive Department
                </button>
              ) : (
                <button className="text-sm text-emerald-400 hover:underline" onClick={() => restore(d)}>
                  Restore Department
                </button>
              )}
            </div>

            {archivingId === d.id && (
              <div className="space-y-2 rounded-md border border-red-900 bg-red-950/40 p-3">
                <p className="text-sm text-red-300">
                  This moves {d.name} out of the active system. Its students, payments, receipts and financial
                  history are kept, not deleted, and it can be restored later. Type the department name to confirm.
                </p>
                <input
                  className="admin-input"
                  placeholder={d.name}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="admin-btn-secondary" onClick={() => { setArchivingId(null); setConfirmText(""); }}>
                    Cancel
                  </button>
                  <button
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={confirmText !== d.name}
                    onClick={() => confirmArchive(d)}
                  >
                    Archive Department
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {paymentSettingsDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={savePaymentSettings} className="admin-card my-8 w-full max-w-lg space-y-5 p-6">
            <div>
              <h2 className="text-lg font-semibold">Payment Settings</h2>
              <p className="text-sm text-muted">{paymentSettingsDept.name}</p>
            </div>

            {paymentError && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{paymentError}</p>}
            {paymentSaved && !paymentError && (
              <p className="rounded-md bg-emerald-950 px-3 py-2 text-sm text-emerald-400">
                Payment configuration saved.
              </p>
            )}

            {paymentLoading ? (
              <p className="text-sm text-muted">Loading current configuration...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm text-muted">Provider</label>
                    <select
                      className="admin-input"
                      value={paymentForm.provider}
                      onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value as "PAYSTACK" | "HUBTEL" })}
                    >
                      <option value="PAYSTACK">Paystack</option>
                      <option value="HUBTEL">Hubtel</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted">Environment</label>
                    <select
                      className="admin-input"
                      value={paymentForm.environment}
                      onChange={(e) => setPaymentForm({ ...paymentForm, environment: e.target.value as "TEST" | "LIVE" })}
                    >
                      <option value="TEST">Test</option>
                      <option value="LIVE">Live</option>
                    </select>
                  </div>
                </div>

                <Section title={paymentForm.provider === "HUBTEL" ? "Hubtel Credentials" : "Paystack Credentials"}>
                  <TextField
                    label={paymentForm.provider === "HUBTEL" ? "Client ID (Public Key)" : "Paystack Public Key"}
                    value={paymentForm.publicKey}
                    onChange={(v) => setPaymentForm({ ...paymentForm, publicKey: v })}
                    placeholder={paymentForm.provider === "HUBTEL" ? "pk_... / Client ID" : "pk_test_... or pk_live_..."}
                    full
                  />
                  <div className="space-y-1 col-span-2">
                    <label className="text-sm text-muted">
                      {paymentForm.provider === "HUBTEL" ? "Client Secret" : "Paystack Secret Key"}
                    </label>
                    <input
                      type="password"
                      className="admin-input"
                      value={paymentForm.secretKey}
                      onChange={(e) => setPaymentForm({ ...paymentForm, secretKey: e.target.value })}
                      placeholder={
                        paymentMeta?.hasSecretKey
                          ? "Secret key is set - leave blank to keep it"
                          : paymentForm.provider === "HUBTEL"
                          ? "Client secret"
                          : "sk_test_... or sk_live_..."
                      }
                    />
                    <p className="text-xs text-muted">
                      Never shown once saved. Leave blank to keep the current secret key.
                    </p>
                  </div>
                  <TextField
                    label="Payment Link / Configuration"
                    value={paymentForm.configValue}
                    onChange={(v) => setPaymentForm({ ...paymentForm, configValue: v })}
                    placeholder={
                      paymentForm.provider === "HUBTEL" ? "Hubtel Merchant Account Number" : "Paystack subaccount / config code"
                    }
                    full
                  />
                  <div className="space-y-1 col-span-2">
                    <label className="text-sm text-muted">Webhook Secret (optional)</label>
                    <input
                      type="password"
                      className="admin-input"
                      value={paymentForm.webhookSecret}
                      onChange={(e) => setPaymentForm({ ...paymentForm, webhookSecret: e.target.value })}
                      placeholder={
                        paymentMeta?.hasWebhookSecret ? "Webhook secret is set - leave blank to keep it" : "Auto-generated if left blank"
                      }
                    />
                  </div>
                </Section>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={closePaymentSettings}>
                Close
              </button>
              <button type="submit" className="admin-btn-primary flex items-center justify-center gap-2" disabled={paymentLoading || paymentSaving}>
                {paymentSaving && <Spinner />}
                {paymentSaving ? "Saving..." : "Save Payment Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={submitCreate} className="admin-card my-8 w-full max-w-2xl space-y-5 p-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <h2 className="text-lg font-semibold">Create Department</h2>
            {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <TextField label="Department Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
              <TextField label="Department Code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
              <div className="space-y-1">
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
            </div>

            <Section title="Payment Configuration">
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Freshers' Fee (GHS)"
                  value={form.fresherAmount}
                  onChange={(v) => setForm({ ...form, fresherAmount: v })}
                />
                <TextField
                  label="Continuing Students' Fee (GHS)"
                  value={form.continuingAmount}
                  onChange={(v) => setForm({ ...form, continuingAmount: v })}
                />
              </div>
            </Section>

            <Section title="Payment Provider">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted">Provider</label>
                  <select
                    className="admin-input"
                    value={form.paymentProvider}
                    onChange={(e) => setForm({ ...form, paymentProvider: e.target.value as "PAYSTACK" | "HUBTEL" })}
                  >
                    <option value="PAYSTACK">Paystack</option>
                    <option value="HUBTEL">Hubtel</option>
                  </select>
                </div>
                <TextField
                  label="Payment Link / Configuration"
                  value={form.paymentConfigValue}
                  onChange={(v) => setForm({ ...form, paymentConfigValue: v })}
                  placeholder={form.paymentProvider === "HUBTEL" ? "Hubtel Merchant Account Number" : "Paystack subaccount / config code"}
                />
              </div>
              <p className="text-xs text-muted">
                Full API credentials (secret keys) are added afterward from the department&apos;s payment settings page.
              </p>
            </Section>

            <Section title="SMS Configuration">
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Sender ID"
                  value={form.smsSenderId}
                  onChange={(v) => setForm({ ...form, smsSenderId: v.slice(0, 11) })}
                  placeholder={form.code.toUpperCase().slice(0, 11) || "e.g. GESA"}
                />
                <TextField
                  label="Receipt SMS Template"
                  value={form.smsMessageTemplate}
                  onChange={(v) => setForm({ ...form, smsMessageTemplate: v })}
                  placeholder="Default template used if left blank"
                  full={false}
                />
              </div>
            </Section>

            <Section title="Department Admin">
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Financial Secretary Name" value={form.adminName} onChange={(v) => setForm({ ...form, adminName: v })} full />
                <TextField label="Email" value={form.adminEmail} onChange={(v) => setForm({ ...form, adminEmail: v })} />
                <TextField label="Phone" value={form.adminPhone} onChange={(v) => setForm({ ...form, adminPhone: v })} />
                <TextField label="Username" value={form.adminUsername} onChange={(v) => setForm({ ...form, adminUsername: v })} />
                <div className="space-y-1">
                  <label className="text-sm text-muted">Password</label>
                  <div className="flex gap-2">
                    <input className="admin-input flex-1" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
                    <button
                      type="button"
                      className="admin-btn-secondary whitespace-nowrap"
                      onClick={() => setForm({ ...form, adminPassword: generateClientPassword() })}
                    >
                      Generate Password
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            <Section title={`Students${students.length ? ` (${students.length} staged)` : ""}`}>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
                <button type="button" className="admin-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Upload CSV
                </button>
                <button type="button" className="admin-btn-secondary" onClick={() => setShowManualRow((v) => !v)}>
                  Add Student Manually
                </button>
              </div>

              {showManualRow && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-white/10 p-3">
                  <TextField label="Full Name" value={manualStudent.fullName} onChange={(v) => setManualStudent({ ...manualStudent, fullName: v })} full />
                  <TextField label="Reference Number" value={manualStudent.referenceNumber} onChange={(v) => setManualStudent({ ...manualStudent, referenceNumber: v })} />
                  <TextField label="Index Number" value={manualStudent.studentIndexNo} onChange={(v) => setManualStudent({ ...manualStudent, studentIndexNo: v })} />
                  <div className="space-y-1">
                    <label className="text-sm text-muted">Level</label>
                    <select
                      className="admin-input"
                      value={manualStudent.level}
                      onChange={(e) => setManualStudent({ ...manualStudent, level: e.target.value as StagedStudent["level"] })}
                    >
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <TextField label="Phone" value={manualStudent.phone} onChange={(v) => setManualStudent({ ...manualStudent, phone: v })} />
                  <TextField label="Email (optional)" value={manualStudent.email} onChange={(v) => setManualStudent({ ...manualStudent, email: v })} full />
                  <div className="col-span-2 flex justify-end">
                    <button type="button" className="admin-btn-primary" onClick={addManualStudent}>Add to list</button>
                  </div>
                </div>
              )}

              {students.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/10 p-2">
                  {students.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span>{s.fullName} · {s.referenceNumber} · {s.level}</span>
                      <button type="button" className="text-red-400 hover:underline" onClick={() => removeStudent(i)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
              <button type="submit" className="admin-btn-primary flex items-center justify-center gap-2" disabled={submitting}>
                {submitting && <Spinner />}
                {submitting ? "Creating..." : "Create Department"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  full,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-sm text-muted">{label}</label>
      <input className="admin-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
