
import { api, ok } from "@/server/api/route";
import { dashboardStats, approvalQueue } from "@/server/services/stats";

export const GET = api(async (req, meta) => {
  const [stats, queue] = await Promise.all([dashboardStats(meta.ctx), approvalQueue(meta.ctx)]);
  return ok({ ...stats, approvalQueue: queue });
});
