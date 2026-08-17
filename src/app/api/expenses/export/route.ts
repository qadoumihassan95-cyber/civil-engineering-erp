
import { api, csvResponse } from "@/server/api/route";
import { exportExpensesCsv } from "@/server/services/importExport";

export const GET = api(async (req, meta) => {
  const projectId = req.nextUrl.searchParams.get("project_id") ?? undefined;
  return csvResponse(await exportExpensesCsv(meta.ctx, projectId), "expenses.csv");
});
