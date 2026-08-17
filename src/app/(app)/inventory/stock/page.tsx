import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getStockReport, listWarehouses, getStockLedger } from "@/server/services/inventory";
import { getAuthUser, requireAnyPermission } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { StockView } from "@/components/inventory/stock-view";

export const dynamic = "force-dynamic";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ warehouse_id?: string; search?: string; tab?: string }> }) {
  const sp = await searchParams;
  const user = (await getAuthUser())!;
  requireAnyPermission(user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [stock, warehouses, ledger] = await Promise.all([
    getStockReport(ctx, { warehouseId: sp.warehouse_id, search: sp.search }),
    listWarehouses(ctx),
    getStockLedger(ctx, { warehouseId: sp.warehouse_id, pageSize: 30 }),
  ]);
  return (
    <StockView
      locale={locale}
      stock={stock}
      warehouses={warehouses}
      ledger={ledger.rows}
      initialTab={sp.tab === "ledger" ? "ledger" : "stock"}
    />
  );
}
