
import { api, ok } from "@/server/api/route";
import { requireAnyPermission } from "@/server/auth/context";
import { getStockReport } from "@/server/services/inventory";

export const GET = api(async (req, meta) => {
  requireAnyPermission(meta.user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const sp = req.nextUrl.searchParams;
  const rows = await getStockReport(meta.ctx, {
    warehouseId: sp.get("warehouse_id") ?? undefined,
    search: sp.get("search") ?? undefined,
  });
  const totalValue = rows.reduce((acc, r) => acc + parseFloat(r.value), 0).toFixed(3);
  return ok({ rows, totalValue });
});
