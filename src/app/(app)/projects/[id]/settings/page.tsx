import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const project = await getProject(ctx, id);
  const settings = (project.settings ?? {}) as {
    dailyReportApproval?: string;
    stockAdjustmentPolicy?: string;
    allowNegativeStock?: boolean;
  };
  return (
    <ProjectSettingsForm
      projectId={id}
      name={project.name}
      canEditPolicy={hasPermission(user.role, "project:settings")}
      settings={{
        dailyReportApproval: settings.dailyReportApproval ?? "manager",
        stockAdjustmentPolicy: settings.stockAdjustmentPolicy ?? "controlled",
        allowNegativeStock: settings.allowNegativeStock ?? false,
      }}
    />
  );
}
