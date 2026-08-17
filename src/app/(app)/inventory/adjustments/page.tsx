import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listAdjustments } from "@/server/services/adjustments";
import { listWarehouses, listMaterials } from "@/server/services/inventory";
import { listVisibleProjects } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { AdjustmentsView } from "@/components/inventory/adjustments-view";

export const dynamic = "force-dynamic";

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [docs, warehouses, materials, projects] = await Promise.all([
    listAdjustments(ctx),
    listWarehouses(ctx),
    listMaterials(ctx),
    listVisibleProjects(ctx),
  ]);
  return (
    <AdjustmentsView
      locale={locale}
      initialRows={docs.rows as never}
      warehouses={warehouses}
      materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
      projects={projects.map((p) => ({ id: p.id, code: p.code, settings: p.settings as unknown as Record<string, unknown> }))}
      openId={sp.open ?? null}
    />
  );
}
