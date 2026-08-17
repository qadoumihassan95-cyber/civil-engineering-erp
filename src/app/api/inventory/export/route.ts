
import { api, csvResponse } from "@/server/api/route";
import { exportInventoryCsv } from "@/server/services/importExport";

export const GET = api(async (req, meta) => {
  const warehouseId = req.nextUrl.searchParams.get("warehouse_id") ?? undefined;
  const csv = await exportInventoryCsv(meta.ctx, warehouseId);
  return csvResponse(csv, "inventory-stock.csv");
});
