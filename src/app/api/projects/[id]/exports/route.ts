
import { api, csvResponse } from "@/server/api/route";
import { exportWirCsv, exportProjectSummaryCsv } from "@/server/services/importExport";

export const GET = api(async (req, meta, params) => {
  const type = req.nextUrl.searchParams.get("type") ?? "wir";
  if (type === "wir") {
    return csvResponse(await exportWirCsv(meta.ctx, params.id), `wir-register-${params.id.slice(0, 8)}.csv`);
  }
  if (type === "summary") {
    return csvResponse(await exportProjectSummaryCsv(meta.ctx, params.id), `project-report-${params.id.slice(0, 8)}.csv`);
  }
  return csvResponse("", "unknown.csv");
});
