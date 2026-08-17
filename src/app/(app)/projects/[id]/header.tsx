import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { StatusBadge } from "@/components/ui/status";
import { ProjectTabs } from "@/components/projects/project-tabs";

export async function ProjectHeader({ projectId }: { projectId: string }) {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const project = await getProject(ctx, projectId);
  const labels = {
    overview: t("projects.overview"),
    boq: t("projects.boq"),
    wir: t("projects.wir"),
    dailyReports: t("projects.dailyReports"),
    inventory: t("projects.inventory"),
    expenses: t("projects.expenses"),
    documents: t("projects.documents"),
    controls: t("projects.controls"),
    settings: t("projects.settings"),
  };
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold tracking-wider text-primary-600">{project.code}</span>
        <StatusBadge kind="project" status={project.status} />
      </div>
      <h1 className="mb-2 text-xl font-bold text-slate-900">{project.name}</h1>
      <ProjectTabs projectId={projectId} labels={labels} />
    </div>
  );
}
