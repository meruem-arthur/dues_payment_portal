"use client";

import { useEffect, useState, useCallback } from "react";

type Student = {
  id: string;
  fullName: string;
  referenceNumber: string;
  studentIndexNo: string | null;
  level: string;
  phone: string;
  email: string | null;
  paymentStatus: string;
};

const emptyForm = {
  fullName: "",
  referenceNumber: "",
  studentIndexNo: "",
  level: "L100",
  phone: "",
  email: "",
};

export function StudentManager({
  departmentId,
  academicSessionId,
}: {
  departmentId?: string;
  academicSessionId: string;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);

  // ---- Edit dialog state -------------------------------------------------
  // CRITICAL: `editingStudentId` tracks which record is open. `editForm` is a
  // LOCAL COPY that the user mutates freely. We never write back to
  // `students` (the source of truth from the DB) until the server confirms
  // a successful save. Closing the dialog (Cancel or the X) only clears
  // this local state - it performs zero network writes and therefore can
  // never clear or corrupt the underlying database record.
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showCsvDialog, setShowCsvDialog] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (departmentId) params.set("departmentId", departmentId);
    if (search) params.set("search", search);
    if (levelFilter) params.set("level", levelFilter);
    if (statusFilter) params.set("paymentStatus", statusFilter);
    const res = await fetch(`/api/students?${params.toString()}`);
    const data = await res.json();
    setStudents(data.students ?? []);
    setLoading(false);
  }, [departmentId, search, levelFilter, statusFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  function openEditDialog(student: Student) {
    // Populate the LOCAL form copy from the database record. This does not
    // touch the server in any way.
    setEditForm({
      fullName: student.fullName,
      referenceNumber: student.referenceNumber,
      studentIndexNo: student.studentIndexNo ?? "",
      level: student.level,
      phone: student.phone,
      email: student.email ?? "",
    });
    setEditError(null);
    setEditingStudentId(student.id);
  }

  function closeEditDialog() {
    // Cancel: discard the local copy only. NO API call happens here.
    setEditingStudentId(null);
    setEditForm(emptyForm);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingStudentId) return;
    setSaving(true);
    setEditError(null);
    const res = await fetch(`/api/students/${editingStudentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEditError(data.error ?? "Could not save changes");
      return;
    }
    closeEditDialog();
    fetchStudents();
  }

  async function deleteStudent(id: string) {
    if (!confirm("Delete this student? This cannot be undone.")) return;
    await fetch(`/api/students/${id}`, { method: "DELETE" });
    fetchStudents();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, departmentId, academicSessionId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error ?? "Could not add student");
      return;
    }
    setAddForm(emptyForm);
    setShowAddDialog(false);
    fetchStudents();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search name, reference, or index no."
          className="admin-input max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="admin-input max-w-[140px]" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">All Levels</option>
          {["L100", "L200", "L300", "L400", "L500", "L600"].map((l) => (
            <option key={l} value={l}>{l.replace("L", "Level ")}</option>
          ))}
        </select>
        <select className="admin-input max-w-[160px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Payment Status</option>
          <option value="SUCCESS">Paid</option>
          <option value="PENDING">Unpaid / Pending</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button className="admin-btn-secondary" onClick={() => setShowCsvDialog(true)}>Upload CSV</button>
          <button className="admin-btn-primary" onClick={() => setShowAddDialog(true)}>Add Student</button>
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3">Name</th>
              <th className="p-3">Reference</th>
              <th className="p-3">Level</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-4 text-center text-muted">Loading...</td></tr>
            )}
            {!loading && students.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted">No students found.</td></tr>
            )}
            {students.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="p-3">{s.fullName}</td>
                <td className="p-3">{s.referenceNumber}</td>
                <td className="p-3">{s.level.replace("L", "")}</td>
                <td className="p-3">{s.phone}</td>
                <td className="p-3">
                  <span className={s.paymentStatus === "SUCCESS" ? "text-accent" : "text-muted"}>
                    {s.paymentStatus === "SUCCESS" ? "PAID" : "UNPAID"}
                  </span>
                </td>
                <td className="space-x-2 p-3 text-right">
                  <button className="text-accent hover:underline" onClick={() => openEditDialog(s)}>Edit</button>
                  <button className="text-red-400 hover:underline" onClick={() => deleteStudent(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Student Dialog */}
      {showAddDialog && (
        <Modal title="Add Student" onClose={() => setShowAddDialog(false)}>
          <form onSubmit={submitAdd} className="space-y-3">
            {addError && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{addError}</p>}
            <StudentFields form={addForm} setForm={setAddForm} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button type="submit" className="admin-btn-primary">Add Student</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Student Dialog - Cancel performs NO mutation, only Save Changes does */}
      {editingStudentId && (
        <Modal title="Edit Student" onClose={closeEditDialog}>
          <div className="space-y-3">
            {editError && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{editError}</p>}
            <StudentFields form={editForm} setForm={setEditForm} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="admin-btn-secondary" onClick={closeEditDialog} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="admin-btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCsvDialog && (
        <CsvUploadDialog
          departmentId={departmentId}
          academicSessionId={academicSessionId}
          onClose={() => setShowCsvDialog(false)}
          onDone={() => {
            setShowCsvDialog(false);
            fetchStudents();
          }}
        />
      )}
    </div>
  );
}

function StudentFields({
  form,
  setForm,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Full Name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} full />
      <Field label="Reference Number" value={form.referenceNumber} onChange={(v) => setForm({ ...form, referenceNumber: v })} />
      <Field label="Student Index No." value={form.studentIndexNo} onChange={(v) => setForm({ ...form, studentIndexNo: v })} />
      <div className="space-y-1">
        <label className="text-sm text-muted">Level</label>
        <select className="admin-input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
          {["L100", "L200", "L300", "L400", "L500", "L600"].map((l) => (
            <option key={l} value={l}>{l.replace("L", "Level ")}</option>
          ))}
        </select>
      </div>
      <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      <Field label="Email (optional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
    </div>
  );
}

function Field({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-sm text-muted">{label}</label>
      <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="admin-card w-full max-w-lg p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CsvUploadDialog({
  departmentId,
  academicSessionId,
  onClose,
  onDone,
}: {
  departmentId?: string;
  academicSessionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    const res = await fetch("/api/students/csv-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText: text, departmentId, academicSessionId, dryRun: true }),
    });
    const data = await res.json();
    setPreview(data);
  }

  async function confirmInsert() {
    if (!csvText) return;
    setSubmitting(true);
    await fetch("/api/students/csv-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText, departmentId, academicSessionId, dryRun: false }),
    });
    setSubmitting(false);
    onDone();
  }

  return (
    <Modal title="Upload Students CSV" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Columns required: name, reference_number, student_id, level, phone, email
        </p>
        <input type="file" accept=".csv" onChange={handleFile} className="admin-input" />

        {preview && (
          <div className="space-y-2 text-sm">
            <p>
              {preview.validCount} valid / {preview.errorCount} errors out of {preview.totalRows} rows
            </p>
            {preview.errors?.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md bg-red-950/50 p-2 text-red-300">
                {preview.errors.slice(0, 20).map((e: any, i: number) => (
                  <div key={i}>Row {e.row}: {e.message}</div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="admin-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="admin-btn-primary" disabled={submitting || preview.validCount === 0} onClick={confirmInsert}>
                {submitting ? "Inserting..." : `Insert ${preview.validCount} Students`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
