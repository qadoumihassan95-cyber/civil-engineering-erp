
import { eq, sql } from "drizzle-orm";
import { transfers, transferItems } from "@/db/schema";
import { getDb } from "@/db";
import { api, ok } from "@/server/api/route";
import { postTransfer, deleteDraftTransfer } from "@/server/services/movements";

export const GET = api(async (_req, meta, params) => {
  const { db } = getDb();
  const [doc] = await db
    .select({
      id: transfers.id,
      number: transfers.number,
      from_warehouse_id: transfers.from_warehouse_id,
      to_warehouse_id: transfers.to_warehouse_id,
      project_id: transfers.project_id,
      transfer_date: transfers.transfer_date,
      status: transfers.status,
      notes: transfers.notes,
      posted_at: transfers.posted_at,
      from_name: sql<string>`(select name from warehouses w where w.id = ${transfers.from_warehouse_id})`,
      to_name: sql<string>`(select name from warehouses w where w.id = ${transfers.to_warehouse_id})`,
    })
    .from(transfers)
    .where(eq(transfers.id, params.id))
    .limit(1);
  if (!doc) return ok(null);
  const items = await db
    .select({
      id: transferItems.id,
      material_id: transferItems.material_id,
      qty: transferItems.qty,
      note: transferItems.note,
      material_code: sql<string>`(select code from materials m where m.id = ${transferItems.material_id})`,
      material_name: sql<string>`(select name from materials m where m.id = ${transferItems.material_id})`,
      unit: sql<string>`(select unit from materials m where m.id = ${transferItems.material_id})`,
    })
    .from(transferItems)
    .where(eq(transferItems.transfer_id, params.id));
  return ok({ ...doc, items });
});

export const POST = api(async (req, meta, params) => {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "post") {
    await postTransfer(meta.ctx, params.id);
    return ok({ ok: true });
  }
  if (action === "delete") {
    await deleteDraftTransfer(meta.ctx, params.id);
    return ok({ ok: true });
  }
  throw new Error("Unknown action");
});
