
import { api, ok } from "@/server/api/route";
import { listAudit } from "@/server/services/audit";
import { isGlobalProjectRole } from "@/server/auth/context";
import { AppError } from "@/server/lib/errors";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("project_id") ?? undefined;
  if (projectId && !isGlobalProjectRole(meta.user.role)) {
    const { hasProjectAccess } = await import("@/server/auth/context");
    if (!(await hasProjectAccess(meta.user, projectId))) {
      throw new AppError("FORBIDDEN", "No access to this project", { i18nKey: "errors.forbidden" });
    }
  }
  const result = await listAudit(meta.ctx, {
    projectId,
    entityType: sp.get("entity_type") ?? undefined,
    action: sp.get("action") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("page_size") ?? 50),
  });
  return ok(result);
});
