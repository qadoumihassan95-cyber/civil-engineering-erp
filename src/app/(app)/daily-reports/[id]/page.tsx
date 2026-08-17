import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getDailyReport, findReportProject } from "@/server/services/dailyReports";
import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { DrDetail } from "@/components/daily-report/dr-detail";

export const dynamic = "force-dynamic";

export default async function DailyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projectId = await findReportProject(ctx, id);
  const [report, project] = await Promise.all([
    getDailyReport(ctx, projectId, id),
    getProject(ctx, projectId),
  ]);
  const settings = (project.settings ?? {}) as { dailyReportApproval?: string };
  return (
    <DrDetail
      report={report as never}
      projectId={projectId}
      locale={locale}
      policy={settings.dailyReportApproval === "none" ? "none" : "manager"}
      perms={{
        create: hasPermission(user.role, "dr:create"),
        approve: hasPermission(user.role, "dr:approve"),
      }}
    />
  );
}
