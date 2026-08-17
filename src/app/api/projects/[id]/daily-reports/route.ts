
import { api, ok, parsed } from "@/server/api/route";
import { listDailyReports, createDailyReport, dailyReportSchema } from "@/server/services/dailyReports";

export const GET = api(async (req, meta, params) => {
  const sp = req.nextUrl.searchParams;
  const rows = await listDailyReports(meta.ctx, params.id, {
    status: sp.get("status") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(rows);
});

export const POST = api(
  async (req, meta, params) => {
    const result = await createDailyReport(meta.ctx, params.id, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: dailyReportSchema , permission: "dr:create"},
);
