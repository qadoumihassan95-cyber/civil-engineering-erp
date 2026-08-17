import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listWarehouses } from "@/server/services/inventory";
import { listVisibleProjects } from "@/server/services/projects";
import { getAuthUser, requireAnyPermission } from "@/server/auth/context";
import { MasterView } from "@/components/inventory/master-view";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = (await getAuthUser())!;
  requireAnyPermission(user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const _store = await cookies();
  const ctx = { db: getDb().db, actor: user };
  const [rows, projects] = await Promise.all([listWarehouses(ctx), listVisibleProjects(ctx)]);
  return (
    <MasterView
      kind="warehouse"
      initialRows={rows as never}
      categories={[]}
      projects={projects.map((p) => ({ id: p.id, code: p.code }))}
    />
  );
}
