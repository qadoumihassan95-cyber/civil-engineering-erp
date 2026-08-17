import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listDocuments } from "@/server/services/documents";
import { listVisibleProjects } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { DocumentsView } from "@/components/documents/documents-view";

export const dynamic = "force-dynamic";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [data, projects] = await Promise.all([
    listDocuments(ctx, { projectId: id }),
    listVisibleProjects(ctx),
  ]);
  return (
    <DocumentsView
      locale={locale}
      initial={data as never}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      canUpload={hasPermission(user.role, "document:upload")}
      canManage={hasPermission(user.role, "document:manage")}
    />
  );
}
