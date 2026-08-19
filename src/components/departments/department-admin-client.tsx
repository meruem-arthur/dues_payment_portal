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
  logoUrl?: string | null;
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

// Shared by the create-department logo picker and the per-department
// "Edit Logo" dialog. Downscales to a small square so every department
// logo renders consistently at the size it's actually shown at, and so
// the stored data URL stays small regardless of the source file.
function resizeLogoFile(
  file: File,
  { onSuccess, onError }: { onSuccess: (dataUrl: string) => void; onError: (msg: string) => void }
) {
  if (!file.type.startsWith("image/")) {
    onError("Please choose an image file");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    onError("Image is too large (max 5MB)");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onError("Could not process image");
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > 700_000) {
        onError("Image is too large even after resizing - try a simpler image");
        return;
      }
      onSuccess(dataUrl);
    };
    img.onerror = () => onError("Could not read that image");
    img.src = reader.result as string;
  };
  reader.onerror = () => onError("Could not read that file");
  reader.readAsDataURL(file);
}

const emptyForm = {
  name: "",
  code: "",
  academicSessionId: "",
  fresherAmount: "",
  continuingAmount: "",
  logoUrl: "",
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

type SmsConfig = {
  senderId: string;
  messageTemplate: string;
  username: string;
  hasApiKey: boolean;
  enabled: boolean;
  updatedAt?: string;
};

const emptySmsForm = {
  senderId: "",
  messageTemplate: "",
  username: "",
  apiKey: "",
  enabled: true,
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
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDept, setLogoDept] = useState<Department | null>(null);
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [logoDeptError, setLogoDeptError] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stale-pending-payment cleanup ("Expire Stale Pending" button below) -
  // tracks which department is currently sweeping and the last result per
  // department, keyed by department id so multiple cards can show feedback
  // independently.
  const [expiringId, setExpiringId] = useState<string | null>(null);
  const [expireMessage, setExpireMessage] = useState<{ id: string; text: string } | null>(null);

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

  // SMS settings modal - same pattern as Payment Settings above: apiKey is
  // never sent back from the GET, so a blank field on save means "leave it
  // as it is" rather than "clear it".
  const [smsSettingsDept, setSmsSettingsDept] = useState<Department | null>(null);
  const [smsForm, setSmsForm] = useState(emptySmsForm);
  const [smsMeta, setSmsMeta] = useState<{ hasApiKey: boolean } | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsSaved, setSmsSaved] = useState(false);

  const shown = departments.filter((d) => (tab === "active" ? d.status === "ACTIVE" : d.status === "ARCHIVED"));

  function resetForm() {
    setForm({ ...emptyForm, academicSessionId: sessions[0]?.id ?? "" });
    setStudents([]);
    setManualStudent(emptyManualStudent);
    setShowManualRow(false);
    setError(null);
    setLogoError(null);
  }

  // Matches handleCsvFile's expected columns exactly: name, reference_number
  // and phone are required (level too, but shown here as a valid sample
  // value); student_id and email are optional and left as empty columns
  // in the blank template row so the header order is still obvious.
  function downloadCsvTemplate() {
    const header = "name,reference_number,student_id,level,phone,email";
    const sampleRow = "Kwame Mensah,9013200723,10987654,300,0551234567,kwame.mensah@example.com";
    const csv = `${header}\n${sampleRow}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_upload_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  function handleLogoFile(file: File | null) {
    setLogoError(null);
    if (!file) return;
    resizeLogoFile(file, {
      onSuccess: (dataUrl) => setForm((f) => ({ ...f, logoUrl: dataUrl })),
      onError: setLogoError,
    });
  }

  function openLogoEditor(dept: Department) {
    setLogoDept(dept);
    setLogoDraft(dept.logoUrl ?? null);
    setLogoDeptError(null);
  }

  function closeLogoEditor() {
    setLogoDept(null);
    setLogoDraft(null);
    setLogoDeptError(null);
  }

  function handleLogoDeptFile(file: File | null) {
    setLogoDeptError(null);
    if (!file) return;
    resizeLogoFile(file, {
      onSuccess: (dataUrl) => setLogoDraft(dataUrl),
      onError: setLogoDeptError,
    });
  }

  async function saveLogoDept() {
    if (!logoDept) return;
    setLogoSaving(true);
    setLogoDeptError(null);
    try {
      const res = await fetch(`/api/departments/${logoDept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_logo", logoUrl: logoDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogoDeptError(data.error ?? "Could not save logo");
        return;
      }
      closeLogoEditor();
      router.refresh();
    } finally {
      setLogoSaving(false);
    }
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
          logoUrl: form.logoUrl || undefined,
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

  // Cancels any payment that's been stuck PENDING for 24h+ (abandoned
  // checkout, webhook that never arrived). Safe to click any time - it only
  // ever touches payments that are already stale.
  async function expireStalePending(dept: Department) {
    setExpiringId(dept.id);
    setExpireMessage(null);
    try {
      const res = await fetch("/api/payments/expire-stale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: dept.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpireMessage({ id: dept.id, text: data.error ?? "Could not expire stale payments" });
        return;
      }
      const count = data.expiredCount ?? 0;
      setExpireMessage({
        id: dept.id,
        text: count === 0 ? "No stale pending payments found" : `Expired ${count} stale pending payment${count === 1 ? "" : "s"}`,
      });
      router.refresh();
    } finally {
      setExpiringId(null);
    }
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

  async function openSmsSettings(dept: Department) {
    setSmsSettingsDept(dept);
    setSmsForm(emptySmsForm);
    setSmsMeta(null);
    setSmsError(null);
    setSmsSaved(false);
    setSmsLoading(true);
    try {
      const res = await fetch(`/api/departments/${dept.id}/sms-config`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsError(data.error ?? "Could not load SMS configuration");
        return;
      }
      const config: SmsConfig | null = data.config;
      if (config) {
        setSmsForm({
          senderId: config.senderId,
          messageTemplate: config.messageTemplate,
          username: config.username,
          apiKey: "",
          enabled: config.enabled,
        });
        setSmsMeta({ hasApiKey: config.hasApiKey });
      } else {
        setSmsMeta({ hasApiKey: false });
      }
    } finally {
      setSmsLoading(false);
    }
  }

  function closeSmsSettings() {
    setSmsSettingsDept(null);
    setSmsForm(emptySmsForm);
    setSmsMeta(null);
    setSmsError(null);
    setSmsSaved(false);
  }

  async function clearSenderId() {
    if (!smsSettingsDept) return;
    setSmsError(null);
    setSmsSaved(false);
    setSmsSaving(true);
    try {
      // Deliberately send senderId: "" here rather than relying on the
      // normal save flow - leaving the field blank there means "no change",
      // so this is the only way to actually clear a bad/unapproved sender
      // id once it's been saved (see africastalking.provider.ts).
      const res = await fetch(`/api/departments/${smsSettingsDept.id}/sms-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsError(data.error ?? "Could not clear sender ID");
        return;
      }
      const config: SmsConfig = data.config;
      setSmsForm((f) => ({ ...f, senderId: config.senderId }));
      setSmsSaved(true);
    } finally {
      setSmsSaving(false);
    }
  }

  async function saveSmsSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!smsSettingsDept) return;
    setSmsError(null);
    setSmsSaved(false);
    setSmsSaving(true);
    try {
      // Same "blank means unchanged" convention as payment settings - only
      // send apiKey if the admin actually typed a new one.
      const body: Record<string, string | boolean> = { enabled: smsForm.enabled };
      if (smsForm.senderId.trim()) body.senderId = smsForm.senderId.trim();
      if (smsForm.messageTemplate.trim()) body.messageTemplate = smsForm.messageTemplate.trim();
      if (smsForm.username.trim()) body.username = smsForm.username.trim();
      if (smsForm.apiKey.trim()) body.apiKey = smsForm.apiKey.trim();

      const res = await fetch(`/api/departments/${smsSettingsDept.id}/sms-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsError(data.error ?? "Could not save SMS configuration");
        return;
      }
      const config: SmsConfig = data.config;
      setSmsForm({
        senderId: config.senderId,
        messageTemplate: config.messageTemplate,
        username: config.username,
        apiKey: "",
        enabled: config.enabled,
      });
      setSmsMeta({ hasApiKey: config.hasApiKey });
      setSmsSaved(true);
    } finally {
      setSmsSaving(false);
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
              <div className="flex items-center gap-2">
                {d.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.logoUrl} alt={`${d.name} logo`} className="h-8 w-8 rounded-full border border-[#2a2338] object-cover" />
                )}
                <h3 className="font-semibold">{d.name}</h3>
              </div>
              <span className="text-xs text-muted">{d.academicSession.name}</span>
            </div>
            <p className="text-sm text-muted">Code: {d.code} · Students: {d._count.students}</p>
            <p className="text-sm">Fresher: GHS {d.fresherAmount} · Continuing: GHS {d.continuingAmount}</p>
            <p className="text-xs text-muted">/d/{d.slug}</p>

            <div className="flex flex-wrap items-center gap-3">
              <button className="text-sm text-sky-400 hover:underline" onClick={() => openPaymentSettings(d)}>
                Payment Settings
              </button>

              <button className="text-sm text-sky-400 hover:underline" onClick={() => openSmsSettings(d)}>
                SMS Settings
              </button>

              <button className="text-sm text-sky-400 hover:underline" onClick={() => openLogoEditor(d)}>
                {d.logoUrl ? "Edit Logo" : "Add Logo"}
              </button>

              <button
                className="text-sm text-amber-400 hover:underline disabled:opacity-50"
                onClick={() => expireStalePending(d)}
                disabled={expiringId === d.id}
                type="button"
              >
                {expiringId === d.id ? "Expiring..." : "Expire Stale Pending"}
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

            {expireMessage?.id === d.id && <p className="text-xs text-muted">{expireMessage.text}</p>}

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

      {smsSettingsDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={saveSmsSettings} className="admin-card my-8 w-full max-w-lg space-y-5 p-6">
            <div>
              <h2 className="text-lg font-semibold">SMS Settings</h2>
              <p className="text-sm text-muted">{smsSettingsDept.name}</p>
            </div>

            {smsError && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{smsError}</p>}
            {smsSaved && !smsError && (
              <p className="rounded-md bg-emerald-950 px-3 py-2 text-sm text-emerald-400">
                SMS configuration saved.
              </p>
            )}

            {smsLoading ? (
              <p className="text-sm text-muted">Loading current configuration...</p>
            ) : (
              <Section title="Africa's Talking Credentials">
                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm text-muted">Send SMS receipts</label>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={smsForm.enabled}
                    onChange={(e) => setSmsForm({ ...smsForm, enabled: e.target.checked })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-muted">Sender ID (optional)</label>
                  <div className="flex gap-2">
                    <input
                      className="admin-input"
                      value={smsForm.senderId}
                      onChange={(e) => setSmsForm({ ...smsForm, senderId: e.target.value.slice(0, 11) })}
                      placeholder="Leave blank until approved by Africa's Talking"
                    />
                    <button
                      type="button"
                      className="admin-btn-secondary whitespace-nowrap"
                      onClick={clearSenderId}
                      disabled={smsSaving || !smsForm.senderId}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <TextField
                  label="Username"
                  value={smsForm.username}
                  onChange={(v) => setSmsForm({ ...smsForm, username: v })}
                  placeholder={'Africa\'s Talking app username ("sandbox" while testing)'}
                />

                <p className="text-xs text-muted col-span-2">
                  An unapproved sender ID gets rejected by Africa&apos;s Talking (error: InvalidSenderId) - click
                  Clear to remove a saved sender ID and messages will send from the account&apos;s default sender
                  until a real one is registered and approved.
                </p>

                <div className="space-y-1 col-span-2">
                  <label className="text-sm text-muted">API Key</label>
                  <input
                    type="password"
                    className="admin-input"
                    value={smsForm.apiKey}
                    onChange={(e) => setSmsForm({ ...smsForm, apiKey: e.target.value })}
                    placeholder={smsMeta?.hasApiKey ? "API key is set - leave blank to keep it" : "Africa's Talking API key"}
                  />
                  <p className="text-xs text-muted">
                    Never shown once saved. Leave blank to keep the current API key.
                  </p>
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-sm text-muted">Receipt SMS Template</label>
                  <textarea
                    className="admin-input resize-y"
                    value={smsForm.messageTemplate}
                    onChange={(e) => setSmsForm({ ...smsForm, messageTemplate: e.target.value })}
                    placeholder="Leave blank to keep the current template"
                    rows={5}
                  />
                  <p className="text-xs text-muted">
                    Placeholders: {"{name} {reference} {level} {amount} {department} {receipt}"}
                  </p>
                </div>
              </Section>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={closeSmsSettings}>
                Close
              </button>
              <button type="submit" className="admin-btn-primary flex items-center justify-center gap-2" disabled={smsLoading || smsSaving}>
                {smsSaving && <Spinner />}
                {smsSaving ? "Saving..." : "Save SMS Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {logoDept && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <div className="admin-card my-8 w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold">Department Logo</h2>
            <p className="text-sm text-muted">{logoDept.name}</p>

            <div className="flex items-center gap-4">
              {logoDraft ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDraft} alt="Logo preview" className="h-16 w-16 rounded-full border border-[#2a2338] object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[#2a2338] text-[10px] text-muted">
                  No logo
                </div>
              )}
              <div className="flex-1 space-y-1">
                <input
                  type="file"
                  accept="image/*"
                  className="admin-input"
                  onChange={(e) => handleLogoDeptFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted">
                  Shown as a small circular badge under the department name on the student payment page.
                </p>
                {logoDeptError && <p className="text-xs text-red-400">{logoDeptError}</p>}
                {logoDraft && (
                  <button type="button" className="text-xs text-red-400 underline" onClick={() => setLogoDraft(null)}>
                    Remove logo
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={closeLogoEditor} disabled={logoSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary flex items-center justify-center gap-2"
                onClick={saveLogoDept}
                disabled={logoSaving}
              >
                {logoSaving && <Spinner />}
                {logoSaving ? "Saving..." : "Save Logo"}
              </button>
            </div>
          </div>
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

            <div className="space-y-1">
              <label className="text-sm text-muted">Department Logo (optional)</label>
              <div className="flex items-center gap-4">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt="Department logo preview"
                    className="h-16 w-16 rounded-full border border-[#2a2338] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[#2a2338] text-[10px] text-muted">
                    No logo
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="admin-input"
                    onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted">
                    Shown as a small circular badge under the department name on the student payment page. Leave
                    this empty and nothing is shown there.
                  </p>
                  {logoError && <p className="text-xs text-red-400">{logoError}</p>}
                  {form.logoUrl && (
                    <button
                      type="button"
                      className="text-xs text-red-400 underline"
                      onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}
                    >
                      Remove logo
                    </button>
                  )}
                </div>
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
              <TextField
                label="Sender ID (optional)"
                value={form.smsSenderId}
                onChange={(v) => setForm({ ...form, smsSenderId: v.slice(0, 11) })}
                placeholder="Leave blank until approved by Africa's Talking"
              />
              <TextAreaField
                label="Receipt SMS Template"
                value={form.smsMessageTemplate}
                onChange={(v) => setForm({ ...form, smsMessageTemplate: v })}
                placeholder={
                  "Default template used if left blank:\nName : {name}\nRef No. : {reference}\nLevel : {level}\nPayment confirmed for {department} dues.\nReceipt No: {receipt}"
                }
                rows={5}
              />
              <p className="text-xs text-muted">
                An unapproved sender ID gets rejected by Africa&apos;s Talking - leave Sender ID blank and messages
                send from the account&apos;s default sender until a real one is registered and approved.
              </p>
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
              <div className="flex flex-wrap gap-2">
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
                <button type="button" className="admin-btn-secondary" onClick={downloadCsvTemplate}>
                  Download CSV Template
                </button>
                <button type="button" className="admin-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Upload CSV
                </button>
                <button type="button" className="admin-btn-secondary" onClick={() => setShowManualRow((v) => !v)}>
                  Add Student Manually
                </button>
              </div>
              <p className="text-xs text-muted">
                Columns: name, reference_number, student_id (optional), level (100-600 or L100-L600), phone, email
                (optional). name, reference_number, level and phone are required for each row.
              </p>

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

function TextAreaField({
  label,
  value,
  onChange,
  full,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-sm text-muted">{label}</label>
      <textarea
        className="admin-input resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    </div>
  );
}
