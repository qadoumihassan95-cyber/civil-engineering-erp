import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { getStockReport, getStockLedger, listWarehouses } from "@/server/services/inventory";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatNumber, formatDateTime } from "@/server/i18n";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui/surfaces";
import { Badge } from "@/components/ui/controls";

export const dynamic = "force-dynamic";

export default async function ProjectInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const warehouses = await listWarehouses(ctx);
  const projectWarehouses = warehouses.filter((w) => w.project_id === id);
  const [stock, ledger] = await Promise.all([
    getStockReport(ctx),
    getStockLedger(ctx, { pageSize: 40 }),
  ]);
  const projectStock = stock.filter((r) => projectWarehouses.some((w) => w.id === r.warehouse_id));
  const projectLedger = ledger.rows.filter((r) => projectWarehouses.some((w) => w.name === r.warehouse_name));

  const fmt = (v: string | number) => formatNumber(v, locale, { maximumFractionDigits: 4 });

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={t("inventory.stockValue")} value={formatNumber(projectStock.reduce((a, r) => a + parseFloat(r.value), 0), locale, { minimumFractionDigits: 3 })} tone="info" />
        <Stat label={t("inventory.lowStock")} value={projectStock.filter((r) => parseFloat(r.min_stock) > 0 && parseFloat(r.qty) < parseFloat(r.min_stock)).length} tone="warning" />
        <Stat label={t("inventory.movementHistory")} value={projectLedger.length} />
      </div>

      <Card>
        <CardHeader
          title={t("inventory.stock")}
          actions={
            <Link href={`/inventory/stock`} className="text-xs font-semibold text-primary-600 hover:underline">
              {t("dashboard.viewAll")}
            </Link>
          }
        />
        {projectStock.length === 0 ? (
          <EmptyState title={t("inventory.noStock")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t("inventory.materials")}</th>
                  <th className="px-3 py-2 text-start">{t("common.warehouse")}</th>
                  <th className="px-3 py-2 text-end">{t("inventory.onHand")}</th>
                  <th className="px-3 py-2 text-end">{t("inventory.stockValue")}</th>
                </tr>
              </thead>
              <tbody>
                {projectStock.map((r) => (
                  <tr key={`${r.material_id}-${r.warehouse_id}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono font-semibold">{r.material_code}</span>
                      <span className="ms-2">{r.material_name}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.warehouse_name}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs">{fmt(r.qty)} {r.unit}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs">{formatNumber(r.value, locale, { minimumFractionDigits: 3 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title={t("dashboard.recentMovements")} />
        {projectLedger.length === 0 ? (
          <EmptyState title={t("common.emptyState")} />
        ) : (
          <div className="divide-y divide-slate-100">
            {projectLedger.slice(0, 15).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone={r.qty.startsWith("-") ? "red" : "green"}>{t(`inventory.txn${txnKey(r.txn_type)}`)}</Badge>
                  <span className="font-mono font-semibold">{r.material_code}</span>
                  <span className="text-slate-500">{r.material_name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-mono ${r.qty.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>
                    {r.qty.startsWith("-") ? "" : "+"}{fmt(r.qty)} {r.unit}
                  </span>
                  <span className="text-slate-400">{formatDateTime(r.created_at, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
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
