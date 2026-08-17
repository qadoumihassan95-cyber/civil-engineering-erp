import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listDailyReports } from "@/server/services/dailyReports";


import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { DrList } from "@/components/daily-report/dr-list";

export const dynamic = "force-dynamic";

export default async function DailyReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [reports, project] = await Promise.all([
    listDailyReports(ctx, id),
    getProject(ctx, id),
  ]);
  const policy = ((project.settings ?? {}) as { dailyReportApproval?: string }).dailyReportApproval;
  return (
    <DrList
      projectId={id}
      locale={locale}
      reports={reports as never}
      canCreate={hasPermission(user.role, "dr:create")}
      policy={policy === "none" ? "none" : "manager"}
    />
  );
}
