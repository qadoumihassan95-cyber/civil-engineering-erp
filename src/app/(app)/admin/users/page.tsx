import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listUsers } from "@/server/services/users";
import { listVisibleProjects } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { UsersView } from "@/components/admin/users-view";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [rows, projects] = await Promise.all([
    listUsers(ctx),
    listVisibleProjects(ctx),
  ]);
  return (
    <UsersView
      locale={locale}
      rows={rows}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
    />
  );
}
