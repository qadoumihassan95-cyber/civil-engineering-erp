
import { api, csvResponse } from "@/server/api/route";
import { exportBoqCsv } from "@/server/services/importExport";

export const GET = api(async (_req, meta, params) => {
  const csv = await exportBoqCsv(meta.ctx, params.id);
  return csvResponse(csv, `boq-${params.id.slice(0, 8)}.csv`);
});
