import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { listVisibleProjects, getProjectSummary } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT, formatMoney } from "@/server/i18n";
import { PageHeader, EmptyState, Card } from "@/components/ui/surfaces";
import { ProgressBar, Badge } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status";
import { NewProjectButton } from "@/components/projects/new-project";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projects = await listVisibleProjects(ctx);
  const summaries = await Promise.all(projects.map((p) => getProjectSummary(ctx, p.id)));

  return (
    <div>
      <PageHeader
        title={t("projects.title")}
        actions={hasPermission(user.role, "project:create") ? <NewProjectButton /> : undefined}
      />
      {projects.length === 0 ? (
        <EmptyState title={t("projects.noProjects")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p, i) => {
            const s = summaries[i];
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="group block">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold tracking-wide text-primary-600">{p.code}</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900 group-hover:text-primary-700">{p.name}</div>
                    </div>
                    <StatusBadge kind="project" status={p.status} />
                  </div>
                  <div className="mb-3 text-xs text-slate-500">{p.location ?? "—"}</div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">{t("projects.progress")}</span>
                    <span className="font-bold text-slate-900">{s.progressPercent}%</span>
                  </div>
                  <ProgressBar value={parseFloat(s.progressPercent)} />
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <div className="text-slate-400">{t("projects.contractValue")}</div>
                      <div className="font-semibold text-slate-800">{formatMoney(p.contract_value, locale)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">{t("projects.approvedValue")}</div>
                      <div className="font-semibold text-slate-800">{formatMoney(s.approvedValue, locale)}</div>
                    </div>
                  </div>
                  {(s.wirCounts.submitted ?? 0) > 0 && (
                    <div className="mt-3">
                      <Badge tone="amber">
                        {s.wirCounts.submitted} {t("wir.title")}
                      </Badge>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
