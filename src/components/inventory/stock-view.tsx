"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Select, Badge } from "@/components/ui/controls";
import { PageHeader, EmptyState, Stat } from "@/components/ui/surfaces";
import { formatNumber, formatDateTime } from "@/server/i18n";

interface StockRow {
  material_id: string;
  warehouse_id: string;
  qty: string;
  last_cost: string | null;
  value: string;
  material_code: string;
  material_name: string;
  unit: string;
  warehouse_code: string;
  warehouse_name: string;
  min_stock: string;
}
interface Warehouse {
  id: string;
  code: string;
  name: string;
}
interface LedgerRow {
  id: string;
  txn_type: string;
  qty: string;
  unit_cost: string | null;
  ref_type: string;
  ref_id: string;
  created_at: string;
  material_code: string;
  material_name: string;
  unit: string;
  warehouse_name: string;
  project_code: string | null;
  poster_name: string | null;
}

export function StockView({
  locale,
  stock,
  warehouses,
  ledger,
  initialTab,
}: {
  locale: string;
  stock: StockRow[];
  warehouses: Warehouse[];
  ledger: LedgerRow[];
  initialTab: "stock" | "ledger";
}) {
  const { t } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"stock" | "ledger">(initialTab);
  const [search, setSearch] = useState(sp.get("search") ?? "");

  const warehouseId = sp.get("warehouse_id") ?? "";
  const totalValue = stock.reduce((a, r) => a + parseFloat(r.value), 0).toFixed(3);

  function applySearch() {
    const params = new URLSearchParams();
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (search) params.set("search", search);
    if (tab === "ledger") params.set("tab", "ledger");
    router.push(`/inventory/stock?${params.toString()}`);
  }

  return (
    <div>
      <PageHeader
        title={t("inventory.stock")}
        subtitle={t("inventory.valueHint")}
        actions={
          <Button variant="outline" onClick={() => window.open("/api/inventory/export", "_blank")}>
            {t("common.export")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("inventory.stockValue")} value={formatNumber(totalValue, locale, { minimumFractionDigits: 3 })} tone="info" />
        <Stat label={t("inventory.lowStock")} value={stock.filter((r) => parseFloat(r.qty) < parseFloat(r.min_stock) && parseFloat(r.min_stock) > 0).length} tone="warning" />
        <Stat label={t("inventory.movementHistory")} value={ledger.length} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
          <button
            onClick={() => setTab("stock")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "stock" ? "bg-primary-600 text-white" : "text-slate-600"}`}
          >
            {t("inventory.stock")}
          </button>
          <button
            onClick={() => setTab("ledger")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "ledger" ? "bg-primary-600 text-white" : "text-slate-600"}`}
          >
            {t("inventory.ledger")}
          </button>
        </div>
        <Select
          value={warehouseId}
          onChange={(e) => {
            const params = new URLSearchParams(sp.toString());
            if (e.target.value) params.set("warehouse_id", e.target.value);
            else params.delete("warehouse_id");
            router.push(`/inventory/stock?${params.toString()}`);
          }}
          className="w-52"
        >
          <option value="">{t("common.all")}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
          ))}
        </Select>
        <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-56" onKeyDown={(e) => e.key === "Enter" && applySearch()} />
        <Button variant="outline" size="sm" onClick={applySearch}>{t("common.search")}</Button>
      </div>

      {tab === "stock" ? (
        stock.length === 0 ? (
          <EmptyState title={t("inventory.noStock")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">{t("inventory.materials")}</th>
                  <th className="px-4 py-2.5 text-start font-semibold">{t("common.warehouse")}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.onHand")}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.minStock")}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.unitCost")}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.stockValue")}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => {
                  const low = parseFloat(r.min_stock) > 0 && parseFloat(r.qty) < parseFloat(r.min_stock);
                  return (
                    <tr key={`${r.material_id}-${r.warehouse_id}`} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-semibold">{r.material_code}</span>
                        <span className="ms-2 text-xs">{r.material_name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{r.warehouse_name}</td>
                      <td className="px-4 py-2.5 text-end font-mono text-xs font-semibold">
                        {formatNumber(r.qty, locale)} {r.unit}
                      </td>
                      <td className="px-4 py-2.5 text-end font-mono text-xs text-slate-400">{formatNumber(r.min_stock, locale)}</td>
                      <td className="px-4 py-2.5 text-end font-mono text-xs">
                        {r.last_cost ? formatNumber(r.last_cost, locale, { minimumFractionDigits: 3 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-end font-mono text-xs">{formatNumber(r.value, locale, { minimumFractionDigits: 3 })}</td>
                      <td className="px-4 py-2.5 text-end">
                        {low ? <Badge tone="amber">{t("inventory.lowStock")}</Badge> : <Badge tone="green">{t("common.ok")}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : ledger.length === 0 ? (
        <EmptyState title={t("inventory.noStock")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.date")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("inventory.txnType")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("inventory.materials")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.warehouse")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("inventory.movement")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.reference")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.project")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.createdBy")}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-xs">{formatDateTime(r.created_at, locale)}</td>
                  <td className="px-4 py-2.5"><Badge tone={r.qty.startsWith("-") ? "red" : "green"}>{t(`inventory.txn${txnKey(r.txn_type)}`)}</Badge></td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="font-mono font-semibold">{r.material_code}</span>
                    <span className="ms-1.5">{r.material_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.warehouse_name}</td>
                  <td className={`px-4 py-2.5 text-end font-mono text-xs font-semibold ${r.qty.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>
                    {r.qty.startsWith("-") ? "" : "+"}{formatNumber(r.qty, locale)} {r.unit}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.ref_id}</td>
                  <td className="px-4 py-2.5 text-xs">{r.project_code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{r.poster_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function txnKey(type: string): string {
  const map: Record<string, string> = {
    receipt: "Receipt",
    issue: "Issue",
    transfer_in: "TransferIn",
    transfer_out: "TransferOut",
    supplier_return: "SupplierReturn",
    adjustment: "Adjustment",
  };
  return map[type] ?? type;
}
