"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea, Badge } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { PageHeader, EmptyState, Card } from "@/components/ui/surfaces";
import { formatNumber } from "@/server/i18n";

interface Section {
  id: string;
  code: string;
  title: string;
  sort: number;
}

interface Item {
  id: string;
  section_id: string | null;
  code: string;
  description: string;
  unit: string;
  contract_qty: string;
  unit_rate: string;
  contract_amount: string;
  executed_qty: string;
  certified_qty: string | null;
  submitted_qty: string;
  approved_qty: string;
  remaining_qty: string;
  progress: string;
  exceeds_contract: boolean;
  sort: number;
}

export function BoqView({
  projectId,
  locale,
  sections,
  items,
  canManage,
  canCertify,
  canExport,
}: {
  projectId: string;
  locale: string;
  sections: Section[];
  items: Item[];
  canManage: boolean;
  canCertify: boolean;
  canExport: boolean;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sectionModal, setSectionModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [variationItem, setVariationItem] = useState<Item | null>(null);
  const [certifyItem, setCertifyItem] = useState<Item | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [sectionForm, setSectionForm] = useState({ code: "", title: "" });
  const [itemForm, setItemForm] = useState({
    section_id: "",
    code: "",
    description: "",
    unit: "m3",
    contract_qty: "0",
    unit_rate: "0",
  });
  const [variationQty, setVariationQty] = useState("");
  const [variationNote, setVariationNote] = useState("");
  const [certifyQty, setCertifyQty] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter(
      (i) => i.code.toLowerCase().includes(s) || i.description.toLowerCase().includes(s),
    );
  }, [items, search]);

  const bySection = useMemo(() => {
    const map = new Map<string | null, Item[]>();
    for (const it of filtered) {
      const list = map.get(it.section_id) ?? [];
      list.push(it);
      map.set(it.section_id, list);
    }
    return map;
  }, [filtered]);

  const grandTotal = items.reduce((a, i) => a + parseFloat(i.contract_amount), 0);

  function fmt(v: string | number) {
    return formatNumber(v, locale, { maximumFractionDigits: 4 });
  }

  async function submitSection() {
    setBusy(true);
    try {
      await api.call("POST", `/api/projects/${projectId}/boq/sections`, sectionForm);
      toast.success(t("common.createdMsg"));
      setSectionModal(false);
      setSectionForm({ code: "", title: "" });
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitItem() {
    setBusy(true);
    try {
      if (editItem) {
        await api.call("PATCH", `/api/projects/${projectId}/boq/items/${editItem.id}`, {
          ...itemForm,
          section_id: itemForm.section_id || null,
        });
      } else {
        await api.call("POST", `/api/projects/${projectId}/boq/items`, {
          ...itemForm,
          section_id: itemForm.section_id || null,
        });
      }
      toast.success(t("common.saved"));
      setItemModal(false);
      setEditItem(null);
      setItemForm({ section_id: "", code: "", description: "", unit: "m3", contract_qty: "0", unit_rate: "0" });
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitVariation() {
    setBusy(true);
    try {
      await api.call("POST", `/api/projects/${projectId}/boq/items/${variationItem?.id}/variation`, {
        contract_qty: variationQty,
        note: variationNote || undefined,
      });
      toast.success(t("common.saved"));
      setVariationItem(null);
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCertify() {
    setBusy(true);
    try {
      await api.call("POST", `/api/projects/${projectId}/boq/items/${certifyItem?.id}/certify`, {
        certified_qty: certifyQty,
      });
      toast.success(t("common.saved"));
      setCertifyItem(null);
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const res = await api.call<{ imported: number; errors: { row: number; message: string }[] }>(
        "POST",
        `/api/projects/${projectId}/boq/import`,
        { csv: text },
      );
      setImportResult(res);
      if (res.imported) router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  function exportCsv() {
    window.open(`/api/projects/${projectId}/boq/export`, "_blank");
  }

  const sortedSections = [...sections].sort((a, b) => a.sort - b.sort);
  const orphanItems = bySection.get(null) ?? [];

  return (
    <div>
      <PageHeader
        title={t("boq.title")}
        actions={
          <>
            {canExport && (
              <Button variant="outline" onClick={exportCsv}>
                {t("boq.exportCsv")}
              </Button>
            )}
            {canManage && (
              <>
                <input
                  ref={importRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleImport(e.target.files?.[0])}
                />
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  {t("boq.import")}
                </Button>
                <Button variant="outline" onClick={() => setSectionModal(true)}>
                  {t("boq.addSection")}
                </Button>
                <Button onClick={() => setItemModal(true)}>+ {t("boq.addItem")}</Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ms-auto text-sm font-semibold text-slate-700">
          {t("boq.grandTotal")}: <span className="text-primary-700">{formatNumber(grandTotal, locale, { minimumFractionDigits: 3 })}</span>
        </div>
      </div>

      {filtered.length === 0 && !search ? (
        <EmptyState title={t("boq.noItems")} hint={t("boq.importHint")} />
      ) : (
        <div className="space-y-4">
          {sortedSections.map((sec) => {
            const list = bySection.get(sec.id) ?? [];
            if (!list.length && search) return null;
            return (
              <Card key={sec.id} padded={false}>
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary-700">{sec.code}</span>
                    <span className="text-sm font-semibold text-slate-800">{sec.title}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    {fmt(list.reduce((a, i) => a + parseFloat(i.contract_amount), 0))}
                  </div>
                </div>
                <ItemsTable
                  items={list}
                  locale={locale}
                  fmt={fmt}
                  canManage={canManage}
                  canCertify={canCertify}
                  onEdit={(it) => {
                    setEditItem(it);
                    setItemForm({
                      section_id: it.section_id ?? "",
                      code: it.code,
                      description: it.description,
                      unit: it.unit,
                      contract_qty: it.contract_qty,
                      unit_rate: it.unit_rate,
                    });
                    setItemModal(true);
                  }}
                  onVariation={(it) => {
                    setVariationItem(it);
                    setVariationQty(it.contract_qty);
                    setVariationNote("");
                  }}
                  onCertify={(it) => {
                    setCertifyItem(it);
                    setCertifyQty(it.certified_qty ?? it.approved_qty);
                  }}
                />
              </Card>
            );
          })}
          {orphanItems.length > 0 && (
            <Card padded={false}>
              <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm font-semibold text-slate-600">
                {t("boq.chooseSection")}
              </div>
              <ItemsTable
                items={orphanItems}
                locale={locale}
                fmt={fmt}
                canManage={canManage}
                canCertify={canCertify}
                onEdit={(it) => {
                  setEditItem(it);
                  setItemForm({
                    section_id: "",
                    code: it.code,
                    description: it.description,
                    unit: it.unit,
                    contract_qty: it.contract_qty,
                    unit_rate: it.unit_rate,
                  });
                  setItemModal(true);
                }}
                onVariation={(it) => {
                  setVariationItem(it);
                  setVariationQty(it.contract_qty);
                }}
                onCertify={(it) => {
                  setCertifyItem(it);
                  setCertifyQty(it.certified_qty ?? it.approved_qty);
                }}
              />
            </Card>
          )}
        </div>
      )}

      <Modal
        open={sectionModal}
        onClose={() => setSectionModal(false)}
        title={t("boq.newSection")}
        footer={
          <>
            <Button variant="outline" onClick={() => setSectionModal(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitSection} loading={busy} disabled={!sectionForm.code || !sectionForm.title}>{t("common.save")}</Button>
          </>
        }
      >
        <Field label={t("common.code")} required className="mb-3">
          <Input value={sectionForm.code} onChange={(e) => setSectionForm({ ...sectionForm, code: e.target.value })} dir="ltr" />
        </Field>
        <Field label={t("common.name")} required>
          <Input value={sectionForm.title} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={itemModal}
        onClose={() => { setItemModal(false); setEditItem(null); }}
        title={editItem ? t("boq.editItem") : t("boq.newItem")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => { setItemModal(false); setEditItem(null); }}>{t("common.cancel")}</Button>
            <Button onClick={submitItem} loading={busy} disabled={!itemForm.code || !itemForm.description}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("boq.code")} required>
            <Input value={itemForm.code} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t("boq.section")}>
            <Select value={itemForm.section_id} onChange={(e) => setItemForm({ ...itemForm, section_id: e.target.value })}>
              <option value="">—</option>
              {sortedSections.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.title}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("boq.unit")} required>
            <Select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}>
              {["m3", "m2", "m", "lm", "ton", "kg", "nos", "lsum", "day", "month", "hour", "trip", "set"].map((u) => (
                <option key={u} value={u}>
                  {t(`units.${u}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("boq.contractQtyLabel")} required>
            <Input value={itemForm.contract_qty} onChange={(e) => setItemForm({ ...itemForm, contract_qty: e.target.value })} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t("boq.newUnitRate")} required className="sm:col-span-2">
            <Input value={itemForm.unit_rate} onChange={(e) => setItemForm({ ...itemForm, unit_rate: e.target.value })} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t("common.description")} required className="sm:col-span-2">
            <Textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!variationItem}
        onClose={() => setVariationItem(null)}
        title={`${t("boq.variation")} — ${variationItem?.code ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setVariationItem(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitVariation} loading={busy}>{t("common.save")}</Button>
          </>
        }
      >
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("boq.variationNote")}</p>
        <Field label={t("boq.contractQtyLabel")} required className="mb-3">
          <Input value={variationQty} onChange={(e) => setVariationQty(e.target.value)} inputMode="decimal" dir="ltr" />
        </Field>
        <Field label={t("common.notes")} optional>
          <Textarea value={variationNote} onChange={(e) => setVariationNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={!!certifyItem}
        onClose={() => setCertifyItem(null)}
        title={`${t("boq.certified")} — ${certifyItem?.code ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCertifyItem(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitCertify} loading={busy}>{t("common.save")}</Button>
          </>
        }
      >
        <Field label={t("boq.certified")} required>
          <Input value={certifyQty} onChange={(e) => setCertifyQty(e.target.value)} inputMode="decimal" dir="ltr" />
        </Field>
      </Modal>

      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); }} title={t("boq.import")}>
        {!importResult ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t("boq.importHint")}</p>
            <input type="file" accept=".csv" onChange={(e) => handleImport(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-md px-3 py-2 text-sm ${importResult.errors.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              {t("boq.importSuccess", { count: importResult.imported, errors: importResult.errors.length })}
            </div>
            {importResult.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("boq.row")}</th>
                      <th className="px-3 py-2 text-start">{t("boq.error")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((e, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono">{e.row}</td>
                        <td className="px-3 py-1.5 text-rose-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ItemsTable({
  items,
  locale,
  fmt,
  canManage,
  canCertify,
  onEdit,
  onVariation,
  onCertify,
}: {
  items: Item[];
  locale: string;
  fmt: (v: string | number) => string;
  canManage: boolean;
  canCertify: boolean;
  onEdit: (it: Item) => void;
  onVariation: (it: Item) => void;
  onCertify: (it: Item) => void;
}) {
  const { t } = useApp();
  const canAct = canManage || canCertify;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="px-4 py-2 text-start font-semibold">{t("boq.code")}</th>
            <th className="px-4 py-2 text-start font-semibold">{t("boq.description")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.contractQty")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.unitRate")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.contractValue")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.executed")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.submitted")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.approved")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.remaining")}</th>
            <th className="px-4 py-2 text-end font-semibold">{t("boq.progress")}</th>
            {canAct && <th className="px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{it.code}</td>
              <td className="max-w-md px-4 py-2 text-xs text-slate-600">
                <div className="line-clamp-2">{it.description}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{it.unit}</div>
              </td>
              <td className="px-4 py-2 text-end font-mono text-xs">{fmt(it.contract_qty)}</td>
              <td className="px-4 py-2 text-end font-mono text-xs">{formatNumber(it.unit_rate, locale, { minimumFractionDigits: 3 })}</td>
              <td className="px-4 py-2 text-end font-mono text-xs font-semibold">{formatNumber(it.contract_amount, locale, { minimumFractionDigits: 3 })}</td>
              <td className="px-4 py-2 text-end font-mono text-xs">{fmt(it.executed_qty)}</td>
              <td className="px-4 py-2 text-end font-mono text-xs text-primary-700">{fmt(it.submitted_qty)}</td>
              <td className="px-4 py-2 text-end font-mono text-xs font-semibold text-emerald-700">{fmt(it.approved_qty)}</td>
              <td className="px-4 py-2 text-end font-mono text-xs">{fmt(it.remaining_qty)}</td>
              <td className="px-4 py-2 text-end">
                <span className="font-mono text-xs">{it.progress}%</span>
                {it.exceeds_contract && (
                  <div className="mt-0.5"><Badge tone="red">{t("boq.exceedsContract")}</Badge></div>
                )}
              </td>
              {canAct && (
                <td className="px-4 py-2 text-end whitespace-nowrap">
                  {canManage && (
                    <>
                      <button className="px-1.5 text-xs font-semibold text-primary-600 hover:underline" onClick={() => onEdit(it)}>
                        {t("common.edit")}
                      </button>
                      <button className="px-1.5 text-xs font-semibold text-amber-600 hover:underline" onClick={() => onVariation(it)}>
                        {t("boq.variation")}
                      </button>
                    </>
                  )}
                  {canCertify && (
                    <button className="px-1.5 text-xs font-semibold text-violet-600 hover:underline" onClick={() => onCertify(it)}>
                      {t("boq.certified")}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
