
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { decideDailyReport, findReportProject } from "@/server/services/dailyReports";

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(4000).optional().nullable(),
});

export const POST = api(
  async (req, meta, params) => {
    const projectId = await findReportProject(meta.ctx, params.id);
    await decideDailyReport(meta.ctx, projectId, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: decideSchema , permission: "dr:approve"},
);
