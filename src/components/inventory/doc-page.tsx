import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listReceipts, listIssues, listTransfers, listReturns, type DocKind } from "@/components/inventory/doc-kind";
import { listWarehouses, listSuppliers, listMaterials } from "@/server/services/inventory";
import { listVisibleProjects } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { InvDocuments } from "@/components/inventory/inv-documents";

export const dynamic = "force-dynamic";

export async function InventoryDocPage({
  kind,
  openId,
}: {
  kind: DocKind;
  openId?: string | null;
}) {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const ctx = { db: getDb().db, actor: user };
  const [docs, warehouses, suppliers, materials, projects] = await Promise.all([
    (() => {
      switch (kind) {
        case "receipt":
          return listReceipts(ctx).then((r) => r.rows);
        case "issue":
          return listIssues(ctx).then((r) => r.rows);
        case "transfer":
          return listTransfers(ctx).then((r) => r.rows);
        case "return":
          return listReturns(ctx).then((r) => r.rows);
      }
    })(),
    listWarehouses(ctx),
    listSuppliers(ctx),
    listMaterials(ctx),
    listVisibleProjects(ctx),
  ]);

  return (
    <InvDocuments
      kind={kind}
      locale={locale}
      initialRows={docs as never}
      warehouses={warehouses}
      suppliers={suppliers}
      materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
      projects={projects.map((p) => ({ id: p.id, code: p.code }))}
      openId={openId ?? null}
    />
  );
}
