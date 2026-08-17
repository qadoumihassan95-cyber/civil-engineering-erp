"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { PageHeader, EmptyState, KV } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { FileUploadButton } from "@/components/ui/file-upload";
import { formatNumber, formatDate, formatDateTime } from "@/server/i18n";

interface AdjRow {
  id: string;
  number: string;
  adjustment_date: string;
  status: string;
  policy: string;
  reason: string;
  posted_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  warehouse_name: string;
  project_code: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  item_count: number;
}

interface AdjItem {
  id: string;
  material_id: string;
  qty_diff: string;
  note: string | null;
  material_code: string;
  material_name: string;
  unit: string;
}

export function AdjustmentsView({
  locale,
  initialRows,
  warehouses,
  materials,
  projects,
  openId,
}: {
  locale: string;
  initialRows: AdjRow[];
  warehouses: { id: string; code: string; name: string; project_id: string | null }[];
  materials: { id: string; code: string; name: string; unit: string }[];
  projects: { id: string; code: string; settings: Record<string, unknown> }[];
  openId?: string | null;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(AdjRow & { items: AdjItem[]; notes: string | null; evidence_name: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    warehouse_id: "",
    project_id: "",
    adjustment_date: new Date().toISOString().slice(0, 10),
    reason: "",
    notes: "",
    evidence_file_id: null as string | null,
    items: [] as { material_id: string; qty_diff: string; note: string | null }[],
  });

  const selectedWarehouse = warehouses.find((w) => w.id === form.warehouse_id);
  const selectedProjectId = form.project_id || selectedWarehouse?.project_id || null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const policy: "simple" | "controlled" =
    (selectedProject?.settings as { stockAdjustmentPolicy?: string } | undefined)?.stockAdjustmentPolicy === "simple"
      ? "simple"
      : "controlled";

  useEffect(() => {
    if (openId) openDetail(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const filtered = useMemo(() => rows.filter((r) => !statusFilter || r.status === statusFilter), [rows, statusFilter]);

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  async function load() {
    const res = await api.call<{ rows: AdjRow[] }>("GET", "/api/inventory/adjustments");
    setRows(res.rows);
  }

  async function openDetail(id: string) {
    try {
      const res = await api.call<(AdjRow & { items: AdjItem[]; notes: string | null; evidence_name: string | null }) | null>("GET", `/api/inventory/adjustments/${id}`);
      if (res) setDetail(res);
    } catch {
      /* ignore */
    }
  }

  async function create() {
    setBusy(true);
    try {
      const res = await api.call<{ id: string; policy: string }>("POST", "/api/inventory/adjustments", {
        warehouse_id: form.warehouse_id,
        project_id: form.project_id || null,
        adjustment_date: form.adjustment_date,
        reason: form.reason,
        notes: form.notes || null,
        evidence_file_id: form.evidence_file_id,
        items: form.items.filter((i) => i.material_id && i.qty_diff),
      });
      toast.success(t("common.createdMsg"));
      setCreateOpen(false);
      resetForm();
      await load();
      if (res.policy === "simple") {
        await api.call("POST", `/api/inventory/adjustments/${res.id}?action=post`, {});
        toast.info(t("common.postedMsg"));
        await load();
      }
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm({
      warehouse_id: "",
      project_id: "",
      adjustment_date: new Date().toISOString().slice(0, 10),
      reason: "",
      notes: "",
      evidence_file_id: null,
      items: [],
    });
  }

  async function act(id: string, action: string, body?: Record<string, unknown>, msg?: string) {
    setBusy(true);
    try {
      await api.call("POST", `/api/inventory/adjustments/${id}?action=${action}`, body ?? {});
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

  return (
    <div>
      <PageHeader
        title={t("nav.adjustments")}
        subtitle={t("inventory.controlledFlow")}
        actions={<Button onClick={() => setCreateOpen(true)}>+ {t("inventory.newAdjustment")}</Button>}
      />

      <div className="mb-4">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option>
          <option value="draft">{t("inventory.statusDraft")}</option>
          <option value="submitted">{t("dailyReport.statusSubmitted")}</option>
          <option value="approved">{t("dailyReport.statusApproved")}</option>
          <option value="rejected">{t("dailyReport.statusRejected")}</option>
          <option value="posted">{t("inventory.statusPosted")}</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("common.emptyState")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">{t("inventory.adjustmentNumber")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.date")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.warehouse")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.project")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.reason")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("projects.stockPolicy")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openDetail(r.id)}>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold">{r.number}</td>
                  <td className="px-4 py-2.5 text-xs">{formatDate(r.adjustment_date, locale)}</td>
                  <td className="px-4 py-2.5 text-xs">{r.warehouse_name}</td>
                  <td className="px-4 py-2.5 text-xs">{r.project_code ?? "—"}</td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-xs">{r.reason}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.policy === "simple" ? t("projects.policySimple") : t("projects.policyControlled")}
                  </td>
                  <td className="px-4 py-2.5 text-end"><StatusBadge kind="adjustment" status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("inventory.newAdjustment")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={!form.warehouse_id || !form.reason || !form.items.some((i) => i.material_id && i.qty_diff)}
            >
              {policy === "simple" ? t("common.confirm") : t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {selectedProject && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {policy === "simple" ? t("inventory.simplePolicyNote") : t("inventory.controlledPolicyNote")}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("common.warehouse")} required>
              <Select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
                <option value="">{t("inventory.chooseWarehouse")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("common.project")} optional>
              <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("inventory.adjustmentDate")} required>
              <Input type="date" value={form.adjustment_date} onChange={(e) => setForm({ ...form, adjustment_date: e.target.value })} />
            </Field>
          </div>
          <Field label={t("common.reason")} required>
            <Textarea className="min-h-16" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Field label={t("inventory.evidenceFile")} optional hint={t("inventory.evidenceHint")}>
            <FileUploadButton
              label={t("common.upload")}
              multiple={false}
              onUploaded={(f) => setForm({ ...form, evidence_file_id: f.id })}
            />
            {form.evidence_file_id && <span className="ms-2 text-xs text-emerald-600">✓</span>}
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">{t("inventory.items")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, items: [...form.items, { material_id: "", qty_diff: "", note: null }] })}
              >
                + {t("inventory.addItem")}
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => {
                const mat = materials.find((m) => m.id === item.material_id);
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Select
                      className="h-8 flex-1 text-xs"
                      value={item.material_id}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[i] = { ...items[i], material_id: e.target.value };
                        setForm({ ...form, items });
                      }}
                    >
                      <option value="">{t("inventory.chooseMaterial")}</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                      ))}
                    </Select>
                    <Input
                      className="h-8 w-32 text-xs"
                      placeholder={t("inventory.qtyDiff")}
                      inputMode="decimal"
                      dir="ltr"
                      value={item.qty_diff}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[i] = { ...items[i], qty_diff: e.target.value };
                        setForm({ ...form, items });
                      }}
                    />
                    {mat && <span className="mt-1.5 w-10 text-xs text-slate-400">{mat.unit}</span>}
                    <button
                      onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}
                      className="mt-1 rounded p-1 text-slate-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${t("inventory.adjustmentNumber")}: ${detail.number}` : ""}
        size="lg"
        footer={
          detail ? (
            <>
              {detail.status === "draft" && detail.policy === "controlled" && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>{t("common.delete")}</Button>
                  <Button variant="outline" onClick={() => act(detail.id, "submit", undefined, t("common.submittedMsg"))}>{t("inventory.submitAdjustment")}</Button>
                </>
              )}
              {detail.status === "draft" && detail.policy === "simple" && (
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>{t("common.delete")}</Button>
              )}
              {detail.status === "submitted" && (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const c = prompt(t("common.comment"));
                      if (c !== null) act(detail.id, "reject", { comment: c }, t("common.rejectedMsg"));
                    }}
                  >
                    {t("common.reject")}
                  </Button>
                  <Button variant="success" size="sm" onClick={() => act(detail.id, "approve", undefined, t("common.approvedMsg"))}>
                    {t("inventory.approveAdjustment")}
                  </Button>
                </>
              )}
              {detail.status === "approved" && (
                <Button variant="success" size="sm" onClick={() => setConfirmPost(true)}>
                  {t("inventory.postAdjustment")}
                </Button>
              )}
              {detail.status === "draft" && detail.policy === "simple" && (
                <Button variant="success" size="sm" onClick={() => act(detail.id, "post", undefined, t("common.postedMsg"))}>
                  {t("inventory.postAdjustment")}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KV label={t("common.date")}>{detail.adjustment_date}</KV>
              <KV label={t("common.status")}><StatusBadge kind="adjustment" status={detail.status} /></KV>
              <KV label={t("common.warehouse")}>{detail.warehouse_name}</KV>
              <KV label={t("common.project")}>{detail.project_code ?? "—"}</KV>
              <KV label={t("common.createdBy")}>{detail.created_by_name ?? "—"}</KV>
              <KV label={t("common.approvedBy")}>{detail.approved_by_name ?? "—"}</KV>
              {detail.posted_at && <KV label={t("inventory.statusPosted")}>{formatDateTime(detail.posted_at, locale)}</KV>}
            </div>
            <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{detail.reason}</div>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("inventory.materials")}</th>
                    <th className="px-3 py-2 text-end">{t("inventory.qtyDiff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono font-semibold">{it.material_code}</span>
                        <span className="ms-2">{it.material_name}</span>
                      </td>
                      <td className={`px-3 py-2 text-end font-mono text-xs font-semibold ${it.qty_diff.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>
                        {it.qty_diff.startsWith("-") ? "" : "+"}{formatNumber(it.qty_diff, locale)} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.evidence_name && (
              <p className="mt-3 text-xs text-slate-500">
                {t("inventory.evidenceFile")}: {detail.evidence_name}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => detail && act(detail.id, "post", undefined, t("common.postedMsg"))}
        title={t("inventory.postAdjustment")}
        message={t("inventory.postConfirm")}
        danger
        loading={busy}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => detail && act(detail.id, "delete", undefined, t("common.deletedMsg"))}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}
