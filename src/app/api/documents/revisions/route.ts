
import { api, ok } from "@/server/api/route";
import { listRevisions } from "@/server/services/documents";

export const GET = api(async (req, meta) => {
  const projectId = req.nextUrl.searchParams.get("project_id") ?? null;
  const seriesKey = req.nextUrl.searchParams.get("series") ?? "";
  const rows = await listRevisions(meta.ctx, seriesKey, projectId);
  return ok(rows);
});
