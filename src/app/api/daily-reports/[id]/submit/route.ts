
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { submitDailyReport, findReportProject } from "@/server/services/dailyReports";

const actionSchema = z.object({ comment: z.string().max(4000).optional().nullable() });

export const POST = api(
  async (req, meta, params) => {
    const projectId = await findReportProject(meta.ctx, params.id);
    await submitDailyReport(meta.ctx, projectId, params.id, parsed<{ comment?: string | null }>(req).comment ?? null);
    return ok({ ok: true });
  },
  { parse: actionSchema , permission: "dr:create"},
);
