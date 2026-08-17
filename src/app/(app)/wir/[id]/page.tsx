import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getWir, findWirProject } from "@/server/services/wir";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { WirDetail } from "@/components/wir/wir-detail";

export const dynamic = "force-dynamic";

export default async function WirDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projectId = await findWirProject(ctx, id);
  const wir = await getWir(ctx, projectId, id);
  return (
    <WirDetail
      wir={wir as never}
      projectId={projectId}
      locale={locale}
      perms={{
        create: hasPermission(user.role, "wir:create"),
        review: hasPermission(user.role, "wir:review"),
        approve: hasPermission(user.role, "wir:approve"),
      }}
      isCreator={wir.engineer_id === user.id}
    />
  );
}
