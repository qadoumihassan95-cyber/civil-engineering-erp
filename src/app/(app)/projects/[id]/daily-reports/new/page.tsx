import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listItemsWithQuantities } from "@/server/services/boq";
import { listMaterials } from "@/server/services/inventory";
import { getAuthUser } from "@/server/auth/context";
import { requireProjectPermission } from "@/server/auth/context";
import { DailyReportForm } from "@/components/daily-report/daily-report-form";

export const dynamic = "force-dynamic";

export default async function NewDailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  await requireProjectPermission(user, id, "dr:create");
  const _store = await cookies();
  const ctx = { db: getDb().db, actor: user };
  const [boqItems, materials] = await Promise.all([
    listItemsWithQuantities(ctx, id),
    listMaterials(ctx),
  ]);
  return (
    <DailyReportForm
      projectId={id}
      boqItems={boqItems.map((b) => ({ id: b.id, code: b.code, description: b.description, unit: b.unit }))}
      materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
    />
  );
}
