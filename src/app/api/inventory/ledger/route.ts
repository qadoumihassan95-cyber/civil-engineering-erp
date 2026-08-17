
import { api, ok } from "@/server/api/route";
import { requireAnyPermission } from "@/server/auth/context";
import { getStockLedger } from "@/server/services/inventory";

export const GET = api(async (req, meta) => {
  requireAnyPermission(meta.user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const sp = req.nextUrl.searchParams;
  const result = await getStockLedger(meta.ctx, {
    warehouseId: sp.get("warehouse_id") ?? undefined,
    materialId: sp.get("material_id") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("page_size") ?? 50),
  });
  return ok(result);
});
