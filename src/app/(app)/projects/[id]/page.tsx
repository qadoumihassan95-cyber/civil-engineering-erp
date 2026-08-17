import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { getProject, getProjectSummary, getProjectMembers } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatMoney, formatDate, formatDateTime } from "@/server/i18n";
import { StatusBadge } from "@/components/ui/status";
import { Card, CardHeader, Stat, KV, EmptyState } from "@/components/ui/surfaces";
import { recentProjectActivity } from "@/server/services/audit";
import { lowStockAlerts } from "@/server/services/inventory";
import { listWirs } from "@/server/services/wir";
import { listDailyReports } from "@/server/services/dailyReports";
import { roleKey } from "@/components/roles";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const project = await getProject(ctx, id);
  const [summary, members, activity, lowStock, wirs, reports] = await Promise.all([
    getProjectSummary(ctx, id),
    getProjectMembers(ctx, id),
    recentProjectActivity(ctx, id, 10),
    lowStockAlerts(ctx),
    listWirs(ctx, id),
    listDailyReports(ctx, id),
  ]);

  const fmtMoney = (v: string) => formatMoney(v, locale);
  const pendingWirs = wirs.filter((w) => w.status === "submitted");
  const pendingReports = reports.filter((r) => r.status === "submitted");

  let scheduleNote = "";
  if ((project.status === "active" || project.status === "planning") && project.planned_end_date) {
    const days = Math.ceil((new Date(project.planned_end_date).getTime() - Date.now()) / 86400000);
    scheduleNote =
      days >= 0 ? t("projects.daysRemaining", { count: days }) : t("projects.daysOverdue", { count: -days });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("projects.progress")} value={`${summary.progressPercent}%`} tone="info" />
        <Stat label={t("projects.contractValue")} value={fmtMoney(summary.contractValue)} />
        <Stat label={t("projects.approvedValue")} value={fmtMoney(summary.approvedValue)} tone="success" />
        <Stat label={t("projects.executedValue")} value={fmtMoney(summary.executedValue)} />
        <Stat label={t("projects.remainingValue")} value={fmtMoney(summary.remainingValue)} />
        <Stat label={t("projects.scheduleStatus")} value={scheduleNote || "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t("projects.contractInfo")} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <KV label={t("projects.client")}>{project.client_name}</KV>
              <KV label={t("projects.consultant")}>{project.consultant_name}</KV>
              <KV label={t("projects.contractor")}>{project.contractor_name}</KV>
              <KV label={t("projects.location")}>{project.location}</KV>
              <KV label={t("projects.startDate")}>{formatDate(project.start_date, locale)}</KV>
              <KV label={t("projects.plannedEnd")}>{formatDate(project.planned_end_date, locale)}</KV>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("projects.pendingItems")}
              actions={
                <Link href={`/projects/${id}/wir`} className="text-xs font-semibold text-primary-600 hover:underline">
                  {t("dashboard.viewAll")}
                </Link>
              }
            />
            {pendingWirs.length === 0 && pendingReports.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingWirs.map((w) => (
                  <Link key={w.id} href={`/wir/${w.id}`} className="flex items-center justify-between px-2 py-2 hover:bg-slate-50">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{w.number}</span>
                      <span className="ms-2 text-xs text-slate-500">{w.location}</span>
                    </div>
                    <StatusBadge kind="wir" status={w.status} />
                  </Link>
                ))}
                {pendingReports.map((r) => (
                  <Link key={r.id} href={`/daily-reports/${r.id}`} className="flex items-center justify-between px-2 py-2 hover:bg-slate-50">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{r.report_date}</span>
                      <span className="ms-2 text-xs text-slate-500">{t("projects.dailyReports")}</span>
                    </div>
                    <StatusBadge kind="daily_report" status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("projects.recentActivity")} />
            {activity.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-2 py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">{a.entity_type}</span>
                      <span className="ms-2 text-xs text-slate-500">
                        {a.action} · {a.actor_name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{formatDateTime(a.created_at, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("projects.team")} />
            {members.length === 0 ? (
              <EmptyState title={t("projects.noMembers")} />
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                      {m.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{m.name}</div>
                      <div className="text-[11px] text-slate-500">{t(`admin.role${roleKey(m.role)}`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("projects.alerts")} />
            {lowStock.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 5).map((s) => (
                  <div key={s.id} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="font-semibold">{s.name}</span> — {s.on_hand} {s.unit}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("projects.financialInfo")} />
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t("projects.approvedValue")}</span>
                <span className="font-semibold">{fmtMoney(summary.approvedValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t("projects.certifiedValue")}</span>
                <span className="font-semibold">{fmtMoney(summary.certifiedValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t("expenses.monthTotal")}</span>
                <span className="font-semibold">{fmtMoney(summary.expensesApproved)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
