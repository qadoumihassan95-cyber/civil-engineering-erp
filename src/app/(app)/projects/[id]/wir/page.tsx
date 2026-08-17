import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listWirs } from "@/server/services/wir";
import { listItemsWithQuantities } from "@/server/services/boq";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { WirList } from "@/components/wir/wir-list";

export const dynamic = "force-dynamic";

export default async function WirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [wirs, boqItems] = await Promise.all([
    listWirs(ctx, id),
    listItemsWithQuantities(ctx, id),
  ]);
  return (
    <WirList
      projectId={id}
      locale={locale}
      wirs={wirs}
      boqItems={boqItems.map((b) => ({
        id: b.id,
        code: b.code,
        description: b.description,
        unit: b.unit,
        contract_qty: b.contract_qty,
        remaining_qty: b.remaining_qty,
      }))}
      canCreate={hasPermission(user.role, "wir:create")}
    />
  );
}
