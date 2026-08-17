import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { listVisibleProjects, computeProjectProgress } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatMoney } from "@/server/i18n";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surfaces";
import { ProgressBar } from "@/components/ui/controls";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projects = await listVisibleProjects(ctx);
  const progress = await Promise.all(projects.map((p) => computeProjectProgress(ctx, p.id)));

  return (
    <div>
      <PageHeader title={t("reports.title")} subtitle={t("reports.transparency")} />
      {projects.length === 0 ? (
        <EmptyState title={t("projects.noProjects")} />
      ) : (
        <Card>
          <CardHeader title={t("reports.progressBySection")} />
          <div className="space-y-4">
            {projects.map((p, i) => {
              const pr = progress[i];
              return (
                <Link key={p.id} href={`/projects/${p.id}/controls`} className="block rounded-lg border border-slate-100 p-4 hover:border-primary-200 hover:bg-primary-50/30">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-primary-700">{p.code}</span>
                      <span className="ms-2 text-sm font-semibold text-slate-800">{p.name}</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-900">{pr.progressPercent}%</span>
                  </div>
                  <ProgressBar value={parseFloat(pr.progressPercent)} />
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                    <span>{t("reports.contractValue")}: <b className="text-slate-800">{formatMoney(pr.contractValue, locale)}</b></span>
                    <span>{t("reports.approvedValue")}: <b className="text-emerald-700">{formatMoney(pr.approvedValue, locale)}</b></span>
                    <span>{t("reports.executedValue")}: <b className="text-slate-800">{formatMoney(pr.executedValue, locale)}</b></span>
                    <span>{t("reports.remaining")}: <b className="text-amber-700">{formatMoney(pr.remainingValue, locale)}</b></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
