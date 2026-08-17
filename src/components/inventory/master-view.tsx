"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { PageHeader, EmptyState } from "@/components/ui/surfaces";

export type MasterKind = "material" | "supplier" | "warehouse";

interface Row {
  id: string;
  [key: string]: unknown;
}

const TITLES: Record<MasterKind, { title: string; newLabel: string }> = {
  material: { title: "nav.materials", newLabel: "nav.materials" },
  supplier: { title: "nav.suppliers", newLabel: "nav.suppliers" },
  warehouse: { title: "nav.warehouses", newLabel: "nav.warehouses" },
};

export function MasterView({
  kind,
  initialRows,
  categories,
  projects,
}: {
  kind: MasterKind;
  initialRows: Row[];
  categories: { id: string; name: string }[];
  projects: { id: string; code: string }[];
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [rows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const titles = TITLES[kind];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(s)),
    );
  }, [rows, search]);

  function openCreate() {
    setForm({});
    setEditRow(null);
    setCreateOpen(true);
  }

  function openEdit(row: Row) {
    setForm({ ...(row as Record<string, string>) });
    setEditRow(row);
    setCreateOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      let payload: Record<string, unknown> = { ...form };
      if (kind === "material") {
        payload = {
          code: form.code,
          name: form.name,
          name_ar: form.name_ar || null,
          category_id: form.category_id || null,
          unit: form.unit,
          description: form.description || null,
          min_stock: form.min_stock || "0",
        };
      }
      if (kind === "supplier") {
        payload = {
          name: form.name,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          tax_number: form.tax_number || null,
        };
      }
      if (kind === "warehouse") {
        payload = {
          code: form.code,
          name: form.name,
          name_ar: form.name_ar || null,
          project_id: form.project_id || null,
        };
      }
      if (editRow) {
        await api.call("PATCH", `/api/inventory/${kind}s/${editRow.id}`, payload);
      } else {
        await api.call("POST", `/api/inventory/${kind}s`, payload);
      }
      toast.success(t("common.saved"));
      setCreateOpen(false);
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
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
        "/api/inventory/import",
        { csv: text },
      );
      if (res.errors.length) {
        toast.error(`${res.errors.length} errors — ${res.errors[0]?.message ?? ""}`);
      } else {
        toast.success(t("boq.importSuccess", { count: res.imported, errors: 0 }));
        router.refresh();
      }
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns: { key: string; label: string }[] =
    kind === "material"
      ? [
          { key: "code", label: t("common.code") },
          { key: "name", label: t("common.name") },
          { key: "category_name", label: t("inventory.category") },
          { key: "unit", label: t("common.unit") },
          { key: "min_stock", label: t("inventory.minStock") },
        ]
      : kind === "supplier"
        ? [
            { key: "name", label: t("common.name") },
            { key: "contact_person", label: t("common.contactPerson") },
            { key: "phone", label: t("common.phone") },
            { key: "email", label: t("common.email") },
          ]
        : [
            { key: "code", label: t("common.code") },
            { key: "name", label: t("common.name") },
            { key: "project_code", label: t("common.project") },
          ];

  return (
    <div>
      <PageHeader
        title={t(titles.title)}
        actions={
          <>
            {kind === "material" && (
              <>
                <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />
                <Button variant="outline" onClick={() => importRef.current?.click()}>{t("common.import")}</Button>
              </>
            )}
            <Button onClick={openCreate}>+ {t(titles.newLabel)}</Button>
          </>
        }
      />

      <div className="mb-4">
        <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("common.emptyState")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2.5 text-start font-semibold">{c.label}</th>
                ))}
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 text-xs">
                      {c.key === "code" || c.key === "project_code" ? (
                        <span className="font-mono font-semibold">{String(r[c.key] ?? "—")}</span>
                      ) : (
                        String(r[c.key] ?? "—")
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-end">
                    <button className="text-xs font-semibold text-primary-600 hover:underline" onClick={() => openEdit(r)}>
                      {t("common.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editRow ? t("common.edit") : `+ ${t(titles.newLabel)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} loading={busy} disabled={kind === "warehouse" && !form.code}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {kind === "material" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("common.code")} required>
                  <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" />
                </Field>
                <Field label={t("inventory.category")}>
                  <Select value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={t("common.name")} required>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("common.unit")} required>
                  <Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </Field>
                <Field label={t("inventory.minStock")}>
                  <Input value={form.min_stock ?? ""} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} inputMode="decimal" dir="ltr" />
                </Field>
              </div>
            </>
          )}
          {kind === "supplier" && (
            <>
              <Field label={t("common.name")} required>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("common.contactPerson")}>
                  <Input value={form.contact_person ?? ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
                </Field>
                <Field label={t("common.phone")}>
                  <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label={t("common.email")}>
                  <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
                </Field>
                <Field label={t("common.taxNumber")}>
                  <Input value={form.tax_number ?? ""} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} />
                </Field>
              </div>
            </>
          )}
          {kind === "warehouse" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("common.code")} required>
                  <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" />
                </Field>
                <Field label={t("common.name")} required>
                  <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
              </div>
              <Field label={t("common.project")} optional>
                <Select value={form.project_id ?? ""} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
