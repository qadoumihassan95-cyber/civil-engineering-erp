
import { api, ok, parsed } from "@/server/api/route";
import {
  getDailyReport,
  updateDailyReport,
  deleteDailyReport,
  findReportProject,
  dailyReportSchema,
} from "@/server/services/dailyReports";

export const GET = api(async (_req, meta, params) => {
  const projectId = await findReportProject(meta.ctx, params.id);
  const report = await getDailyReport(meta.ctx, projectId, params.id);
  return ok(report);
});

export const PATCH = api(
  async (req, meta, params) => {
    const projectId = await findReportProject(meta.ctx, params.id);
    await updateDailyReport(meta.ctx, projectId, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: dailyReportSchema, permission: "dr:create" },
);

export const DELETE = api(async (_req, meta, params) => {
  const projectId = await findReportProject(meta.ctx, params.id);
  await deleteDailyReport(meta.ctx, projectId, params.id);
  return ok({ ok: true });
});
