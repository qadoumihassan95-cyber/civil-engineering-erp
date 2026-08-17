"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { PageHeader, EmptyState, KV } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { formatNumber, formatDate, formatDateTime } from "@/server/i18n";

interface WarehouseOpt {
  id: string;
  code: string;
  name: string;
  project_id: string | null;
}
interface SupplierOpt {
  id: string;
  name: string;
}
interface MaterialOpt {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface DocRow {
  id: string;
  number: string;
  date: string;
  status: string;
  posted_at: string | null;
  supplier_name?: string | null;
  warehouse_name: string;
  project_code: string | null;
  item_count: number;
  from_name?: string;
  to_name?: string;
  reason?: string | null;
  purpose?: string | null;
  requested_by?: string | null;
}

export type DocKind = "receipt" | "issue" | "transfer" | "return";

const CONFIG: Record<
  DocKind,
  {
    api: string;
    labelKey: string;
    newKey: string;
    dateKey: string;
    numberKey: string;
    useSupplier: boolean;
    useToWarehouse: boolean;
  }
> = {
  receipt: {
    api: "/api/inventory/receipts",
    labelKey: "nav.receipts",
    newKey: "inventory.newReceipt",
    dateKey: "inventory.receiptDate",
    numberKey: "inventory.receiptNumber",
    useSupplier: true,
    useToWarehouse: false,
  },
  issue: {
    api: "/api/inventory/issues",
    labelKey: "nav.issues",
    newKey: "inventory.newIssue",
    dateKey: "inventory.issueDate",
    numberKey: "inventory.issueNumber",
    useSupplier: false,
    useToWarehouse: false,
  },
  transfer: {
    api: "/api/inventory/transfers",
    labelKey: "nav.transfers",
    newKey: "inventory.newTransfer",
    dateKey: "inventory.transferDate",
    numberKey: "inventory.transferNumber",
    useSupplier: false,
    useToWarehouse: true,
  },
  return: {
    api: "/api/inventory/returns",
    labelKey: "nav.returns",
    newKey: "inventory.newReturn",
    dateKey: "inventory.returnDate",
    numberKey: "inventory.returnNumber",
    useSupplier: true,
    useToWarehouse: false,
  },
};

interface DocItem {
  material_id: string;
  qty: string;
  unit_cost?: string | null;
  note?: string | null;
  material_code?: string;
  material_name?: string;
  unit?: string;
}

export function InvDocuments({
  kind,
  locale,
  initialRows,
  warehouses,
  suppliers,
  materials,
  projects,
  openId,
}: {
  kind: DocKind;
  locale: string;
  initialRows: DocRow[];
  warehouses: WarehouseOpt[];
  suppliers: SupplierOpt[];
  materials: MaterialOpt[];
  projects: { id: string; code: string }[];
  openId?: string | null;
}) {
  const cfg = CONFIG[kind];
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(DocRow & { items: DocItem[]; notes?: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    warehouse_id: "",
    to_warehouse_id: "",
    supplier_id: "",
    project_id: "",
    date: new Date().toISOString().slice(0, 10),
    requested_by: "",
    purpose: "",
    reason: "",
    notes: "",
    items: [] as DocItem[],
  });

  useEffect(() => {
    if (openId) openDetail(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const filtered = useMemo(
    () => rows.filter((r) => !statusFilter || r.status === statusFilter),
    [rows, statusFilter],
  );

  async function load() {
    const res = await api.call<{ rows: DocRow[] }>("GET", cfg.api);
    setRows(res.rows);
  }

  async function openDetail(id: string) {
    try {
      const res = await api.call<(DocRow & { items: DocItem[] }) | null>("GET", `${cfg.api}/${id}`);
      if (res) setDetail(res);
    } catch {
      /* ignore */
    }
  }

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  async function create() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        warehouse_id: form.warehouse_id,
        project_id: form.project_id || null,
        supplier_id: form.supplier_id || null,
        notes: form.notes || null,
        items: form.items.filter((i) => i.material_id && i.qty),
      };
      if (kind === "receipt") payload.receipt_date = form.date;
      if (kind === "issue") {
        payload.issue_date = form.date;
        payload.requested_by = form.requested_by || null;
        payload.purpose = form.purpose || null;
      }
      if (kind === "transfer") {
        payload.transfer_date = form.date;
        payload.from_warehouse_id = form.warehouse_id;
        payload.to_warehouse_id = form.to_warehouse_id;
      }
      if (kind === "return") {
        payload.return_date = form.date;
        payload.reason = form.reason || null;
      }
      await api.call("POST", cfg.api, payload);
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
      warehouse_id: "",
      to_warehouse_id: "",
      supplier_id: "",
      project_id: "",
      date: new Date().toISOString().slice(0, 10),
      requested_by: "",
      purpose: "",
      reason: "",
      notes: "",
      items: [],
    });
  }

  async function postDoc(id: string) {
    setBusy(true);
    try {
      await api.call("POST", `${cfg.api}/${id}?action=post`, {});
      toast.success(t("common.postedMsg"));
      setConfirmPost(false);
      setDetail(null);
      await load();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoc(id: string) {
    setBusy(true);
    try {
      await api.call("POST", `${cfg.api}/${id}?action=delete`, {});
      toast.success(t("common.deletedMsg"));
      setConfirmDelete(false);
      setDetail(null);
      await load();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const fmt = (v: string | number) => formatNumber(v, locale);

  return (
    <div>
      <PageHeader
        title={t(cfg.labelKey)}
        actions={
          <Button onClick={() => setCreateOpen(true)}>+ {t(cfg.newKey)}</Button>
        }
      />

      <div className="mb-4">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option>
          <option value="draft">{t("inventory.statusDraft")}</option>
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
                <th className="px-4 py-2.5 text-start font-semibold">{t(cfg.numberKey)}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.date")}</th>
                {(kind === "receipt" || kind === "return") && (
                  <th className="px-4 py-2.5 text-start font-semibold">{t("common.supplier")}</th>
                )}
                <th className="px-4 py-2.5 text-start font-semibold">
                  {kind === "transfer" ? t("inventory.fromWarehouse") : t("common.warehouse")}
                </th>
                {kind === "transfer" && (
                  <th className="px-4 py-2.5 text-start font-semibold">{t("inventory.toWarehouse")}</th>
                )}
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.project")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.items")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openDetail(r.id)}>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-800">{r.number}</td>
                  <td className="px-4 py-2.5 text-xs">{formatDate(r.date, locale)}</td>
                  {(kind === "receipt" || kind === "return") && (
                    <td className="px-4 py-2.5 text-xs">{r.supplier_name ?? "—"}</td>
                  )}
                  <td className="px-4 py-2.5 text-xs">{r.warehouse_name}</td>
                  {kind === "transfer" && <td className="px-4 py-2.5 text-xs">{r.to_name ?? "—"}</td>}
                  <td className="px-4 py-2.5 text-xs">{r.project_code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-end font-mono text-xs">{r.item_count}</td>
                  <td className="px-4 py-2.5 text-end"><StatusBadge kind="posting" status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t(cfg.newKey)}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={create} loading={busy} disabled={!form.warehouse_id || !form.items.some((i) => i.material_id && i.qty)}>
              {t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t(cfg.dateKey)} required>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={kind === "transfer" ? t("inventory.fromWarehouse") : t("common.warehouse")} required>
              <Select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
                <option value="">{t("inventory.chooseWarehouse")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
            {kind === "transfer" && (
              <Field label={t("inventory.toWarehouse")} required>
                <Select value={form.to_warehouse_id} onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })}>
                  <option value="">{t("inventory.chooseWarehouse")}</option>
                  {warehouses.filter((w) => w.id !== form.warehouse_id).map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            {(kind === "receipt" || kind === "return") && (
              <Field label={t("common.supplier")}>
                <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">{t("inventory.chooseSupplier")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t("common.project")} optional>
              <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </Select>
            </Field>
            {kind === "issue" && (
              <>
                <Field label={t("inventory.requestedBy")} optional>
                  <Input value={form.requested_by} onChange={(e) => setForm({ ...form, requested_by: e.target.value })} />
                </Field>
                <Field label={t("inventory.purpose")} optional>
                  <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
                </Field>
              </>
            )}
            {kind === "return" && (
              <Field label={t("common.reason")} optional className="sm:col-span-2">
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">{t("inventory.items")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, items: [...form.items, { material_id: "", qty: "", unit_cost: null, note: null }] })}
              >
                + {t("inventory.addItem")}
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => {
                const mat = materials.find((m) => m.id === item.material_id);
                return (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Select
                        className="h-8 text-xs"
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
                    </div>
                    <Input
                      className="h-8 w-28 text-xs"
                      placeholder={t("common.quantity")}
                      inputMode="decimal"
                      dir="ltr"
                      value={item.qty}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[i] = { ...items[i], qty: e.target.value };
                        setForm({ ...form, items });
                      }}
                    />
                    {kind === "receipt" && (
                      <Input
                        className="h-8 w-28 text-xs"
                        placeholder={t("inventory.unitCost")}
                        inputMode="decimal"
                        dir="ltr"
                        value={item.unit_cost ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[i] = { ...items[i], unit_cost: e.target.value || null };
                          setForm({ ...form, items });
                        }}
                      />
                    )}
                    {mat && <span className="mt-1.5 w-12 text-xs text-slate-400">{mat.unit}</span>}
                    <button
                      onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}
                      className="mt-1 rounded p-1 text-slate-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {form.items.length === 0 && (
                <p className="text-xs text-slate-400">{t("common.emptyState")}</p>
              )}
            </div>
          </div>

          <Field label={t("common.notes")} optional>
            <Textarea className="min-h-16" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{t("inventory.postConfirm")}</p>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${t(cfg.numberKey)}: ${detail.number}` : ""}
        size="lg"
        footer={
          detail ? (
            <>
              {detail.status === "draft" && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                    {t("common.delete")}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmPost(true)}>
                    {t("common.post")}
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KV label={t("common.date")}>{formatDate(detail.date, locale)}</KV>
              <KV label={t("common.status")}><StatusBadge kind="posting" status={detail.status} /></KV>
              {detail.supplier_name && <KV label={t("common.supplier")}>{detail.supplier_name}</KV>}
              <KV label={t("common.warehouse")}>{detail.warehouse_name}</KV>
              {detail.to_name && <KV label={t("inventory.toWarehouse")}>{detail.to_name}</KV>}
              {detail.project_code && <KV label={t("common.project")}>{detail.project_code}</KV>}
              {detail.requested_by && <KV label={t("inventory.requestedBy")}>{detail.requested_by}</KV>}
              {detail.reason && <KV label={t("common.reason")}>{detail.reason}</KV>}
              {detail.posted_at && <KV label={t("inventory.statusPosted")}>{formatDateTime(detail.posted_at, locale)}</KV>}
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("inventory.materials")}</th>
                    <th className="px-3 py-2 text-end">{t("common.quantity")}</th>
                    {kind === "receipt" && <th className="px-3 py-2 text-end">{t("inventory.unitCost")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono font-semibold">{it.material_code}</span>
                        <span className="ms-2">{it.material_name}</span>
                      </td>
                      <td className="px-3 py-2 text-end font-mono text-xs">
                        {fmt(it.qty)} {it.unit}
                      </td>
                      {kind === "receipt" && (
                        <td className="px-3 py-2 text-end font-mono text-xs">
                          {it.unit_cost ? formatNumber(it.unit_cost, locale, { minimumFractionDigits: 3 }) : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.status === "posted" && (
              <p className="mt-3 text-[11px] text-slate-400">{t("inventory.postedDocLocked")}</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => detail && postDoc(detail.id)}
        title={t("common.post")}
        message={t("inventory.postConfirm")}
        danger
        loading={busy}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => detail && deleteDoc(detail.id)}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}
