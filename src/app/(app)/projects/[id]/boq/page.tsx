import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listSections, listItemsWithQuantities } from "@/server/services/boq";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { BoqView } from "@/components/boq/boq-view";

export const dynamic = "force-dynamic";

export default async function BoqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [sections, items] = await Promise.all([
    listSections(ctx, id),
    listItemsWithQuantities(ctx, id),
  ]);
  return (
    <BoqView
      projectId={id}
      locale={locale}
      sections={sections}
      items={items}
      canManage={hasPermission(user.role, "boq:manage")}
      canCertify={hasPermission(user.role, "boq:certify")}
      canExport={hasPermission(user.role, "export:use")}
    />
  );
}
