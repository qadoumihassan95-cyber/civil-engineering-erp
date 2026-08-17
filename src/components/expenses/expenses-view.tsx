"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea, Badge } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { PageHeader, EmptyState, KV } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { FileUploadButton } from "@/components/ui/file-upload";
import { formatNumber, formatDate } from "@/server/i18n";

interface ExpenseRow {
  id: string;
  project_id: string;
  number: string;
  expense_date: string;
  amount: string;
  tax_amount: string;
  total: string;
  currency: string;
  payment_method: string;
  supplier_name: string | null;
  reference_no: string | null;
  description: string | null;
  status: string;
  approved_at: string | null;
  project_code: string;
  project_name: string;
  category_name: string | null;
  creator_name: string | null;
  approver_name: string | null;
}

interface InitialData {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { status: string; total: string }[];
  categories: { id: string; name: string; name_ar: string | null }[];
}

export function ExpensesView({
  locale,
  initial,
  categories,
  projects,
  suppliers,
  canCreate,
  canApprove,
  canExport,
  openId,
}: {
  locale: string;
  initial: InitialData;
  categories: { id: string; name: string; name_ar: string | null }[];
  projects: { id: string; code: string; name: string }[];
  suppliers: { id: string; name: string }[];
  canCreate: boolean;
  canApprove: boolean;
  canExport: boolean;
  openId?: string | null;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState(initial.rows);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(ExpenseRow & { attachments: { id: string; name: string; mime: string }[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  const [form, setForm] = useState({
    project_id: "",
    category_id: "",
    supplier_id: "",
    supplier_name: "",
    expense_date: new Date().toISOString().slice(0, 10),
    amount: "",
    tax_amount: "0",
    payment_method: "cash",
    reference_no: "",
    description: "",
    file_ids: [] as string[],
  });

  useEffect(() => {
    if (openId) openDetail(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const statusFilter = sp.get("status") ?? "";
  const projectFilter = sp.get("project_id") ?? "";
  const page = Number(sp.get("page") ?? 1);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/expenses?${params.toString()}`);
  }

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  async function load() {
    const params = new URLSearchParams(sp.toString());
    const res = await api.call<InitialData>("GET", `/api/expenses?${params.toString()}`);
    setRows(res.rows);
  }

  async function openDetail(id: string) {
    try {
      const res = await api.call<(ExpenseRow & { attachments: { id: string; name: string; mime: string }[] }) | null>("GET", `/api/expenses/${id}`);
      if (res) setDetail(res);
    } catch {
      /* ignore */
    }
  }

  async function create() {
    setBusy(true);
    try {
      await api.call("POST", "/api/expenses", {
        ...form,
        project_id: form.project_id,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name || null,
        reference_no: form.reference_no || null,
        description: form.description || null,
      });
      toast.success(t("common.createdMsg"));
      setCreateOpen(false);
      resetForm();
      await load();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm({
      project_id: "",
      category_id: "",
      supplier_id: "",
      supplier_name: "",
      expense_date: new Date().toISOString().slice(0, 10),
      amount: "",
      tax_amount: "0",
      payment_method: "cash",
      reference_no: "",
      description: "",
      file_ids: [],
    });
  }

  async function act(id: string, action: string, body?: Record<string, unknown>, msg?: string) {
    setBusy(true);
    try {
      await api.call("POST", `/api/expenses/${id}?action=${action}`, body ?? {});
      toast.success(msg ?? t("common.saved"));
      setDetail(null);
      await load();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const fmtMoney = (v: string | number) => formatNumber(v, locale, { minimumFractionDigits: 3 });

  return (
    <div>
      <PageHeader
        title={t("expenses.title")}
        actions={
          <>
            {canExport && (
              <Button variant="outline" onClick={() => window.open(`/api/expenses/export${projectFilter ? `?project_id=${projectFilter}` : ""}`, "_blank")}>
                {t("common.export")}
              </Button>
            )}
            {canCreate && <Button onClick={() => setCreateOpen(true)}>+ {t("expenses.new")}</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={projectFilter} onChange={(e) => setParam("project_id", e.target.value)} className="w-48">
          <option value="">{t("expenses.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setParam("status", e.target.value)} className="w-40">
          <option value="">{t("common.all")}</option>
          <option value="draft">{t("expenses.statusDraft")}</option>
          <option value="submitted">{t("expenses.statusSubmitted")}</option>
          <option value="approved">{t("expenses.statusApproved")}</option>
          <option value="rejected">{t("expenses.statusRejected")}</option>
        </Select>
        <div className="ms-auto flex gap-4 text-xs text-slate-500">
          {initial.totals.map((tt) => (
            <span key={tt.status}>
              {t(`expenses.status${cap(tt.status)}`)}: <span className="font-bold text-slate-800">{fmtMoney(tt.total)}</span>
            </span>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("expenses.noExpenses")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">{t("expenses.number")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.date")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.project")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("expenses.payee")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("expenses.category")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("expenses.amount")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("expenses.total")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openDetail(r.id)}>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold">{r.number}</td>
                  <td className="px-4 py-2.5 text-xs">{formatDate(r.expense_date, locale)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{r.project_code}</td>
                  <td className="px-4 py-2.5 text-xs">{r.supplier_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{r.category_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-end font-mono text-xs">{fmtMoney(r.amount)}</td>
                  <td className="px-4 py-2.5 text-end font-mono text-xs font-semibold">{fmtMoney(r.total)}</td>
                  <td className="px-4 py-2.5 text-end"><StatusBadge kind="expense" status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {initial.total > initial.pageSize && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              <span>{t("common.showing")} {(page - 1) * initial.pageSize + 1}–{Math.min(page * initial.pageSize, initial.total)} {t("common.of")} {initial.total}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>←</Button>
                <Button variant="outline" size="sm" disabled={page * initial.pageSize >= initial.total} onClick={() => setParam("page", String(page + 1))}>→</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("expenses.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={create} loading={busy} disabled={!form.project_id || !form.amount}>{t("common.create")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("common.project")} required>
              <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("expenses.date")} required>
              <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <Field label={t("expenses.category")}>
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("common.supplier")}>
              <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">{t("inventory.chooseSupplier")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("expenses.payee")} optional>
              <Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder={t("inventory.unknownSupplier")} />
            </Field>
            <Field label={t("expenses.paymentMethod")}>
              <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="cash">{t("expenses.cash")}</option>
                <option value="bank_transfer">{t("expenses.bankTransfer")}</option>
                <option value="cheque">{t("expenses.cheque")}</option>
                <option value="card">{t("expenses.card")}</option>
              </Select>
            </Field>
            <Field label={t("expenses.amount")} required>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" dir="ltr" />
            </Field>
            <Field label={t("expenses.tax")}>
              <Input value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} inputMode="decimal" dir="ltr" />
            </Field>
            <Field label={t("expenses.referenceNo")} optional>
              <Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} dir="ltr" />
            </Field>
          </div>
          <Field label={t("common.description")} optional>
            <Textarea className="min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t("expenses.receipt")} optional>
            <FileUploadButton label={t("common.upload")} onUploaded={(f) => setForm({ ...form, file_ids: [...form.file_ids, f.id] })} />
            {form.file_ids.length > 0 && <Badge tone="blue">{form.file_ids.length}</Badge>}
          </Field>
          <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{t("expenses.approveNote")}</p>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${t("expenses.number")}: ${detail.number}` : ""}
        footer={
          detail ? (
            <>
              {detail.status === "draft" && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>{t("common.delete")}</Button>
                  <Button variant="outline" onClick={() => act(detail.id, "submit", undefined, t("common.submittedMsg"))}>{t("expenses.submit")}</Button>
                </>
              )}
              {detail.status === "submitted" && canApprove && (
                <>
                  <Button variant="danger" size="sm" onClick={() => { setRejectComment(""); setRejectOpen(true); }}>{t("common.reject")}</Button>
                  <Button variant="success" size="sm" onClick={() => act(detail.id, "approve", undefined, t("common.approvedMsg"))}>{t("common.approve")}</Button>
                </>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KV label={t("common.project")}><span className="font-mono">{detail.project_code}</span></KV>
              <KV label={t("common.date")}>{formatDate(detail.expense_date, locale)}</KV>
              <KV label={t("common.status")}><StatusBadge kind="expense" status={detail.status} /></KV>
              <KV label={t("expenses.paymentMethod")}>{t(`expenses.${detail.payment_method}`)}</KV>
              <KV label={t("expenses.payee")}>{detail.supplier_name ?? "—"}</KV>
              <KV label={t("expenses.category")}>{detail.category_name ?? "—"}</KV>
              <KV label={t("expenses.amount")}>{fmtMoney(detail.amount)}</KV>
              <KV label={t("expenses.tax")}>{fmtMoney(detail.tax_amount)}</KV>
              <KV label={t("expenses.total")}><span className="font-bold">{fmtMoney(detail.total)} {detail.currency}</span></KV>
              <KV label={t("common.createdBy")}>{detail.creator_name ?? "—"}</KV>
              <KV label={t("common.approvedBy")}>{detail.approver_name ?? "—"}</KV>
              <KV label={t("expenses.referenceNo")}>{detail.reference_no ?? "—"}</KV>
            </div>
            {detail.description && <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{detail.description}</div>}
            {detail.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detail.attachments.map((f) => (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-primary-600 hover:bg-slate-50">
                    {f.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t("common.reject")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={busy} onClick={() => { setRejectOpen(false); if (detail) act(detail.id, "reject", { comment: rejectComment }, t("common.rejectedMsg")); }}>
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <Field label={t("common.comment")} required>
          <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.call("DELETE", `/api/expenses/${detail?.id}`);
            toast.success(t("common.deletedMsg"));
            setDetail(null);
            await load();
            router.refresh();
          } catch (e) {
            toast.error(errMsg(e));
          } finally {
            setBusy(false);
            setConfirmDelete(false);
          }
        }}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
