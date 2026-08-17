import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listSuppliers } from "@/server/services/inventory";
import { getAuthUser, requireAnyPermission } from "@/server/auth/context";
import { MasterView } from "@/components/inventory/master-view";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = (await getAuthUser())!;
  requireAnyPermission(user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const _store = await cookies();
  const ctx = { db: getDb().db, actor: user };
  const rows = await listSuppliers(ctx);
  return <MasterView kind="supplier" initialRows={rows as never} categories={[]} projects={[]} />;
}
