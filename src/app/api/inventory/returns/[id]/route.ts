
import { eq, sql } from "drizzle-orm";
import { supplierReturns, returnItems } from "@/db/schema";
import { getDb } from "@/db";
import { api, ok } from "@/server/api/route";
import { postSupplierReturn, deleteDraftSupplierReturn } from "@/server/services/movements";

export const GET = api(async (_req, meta, params) => {
  const { db } = getDb();
  const [doc] = await db
    .select({
      id: supplierReturns.id,
      number: supplierReturns.number,
      supplier_id: supplierReturns.supplier_id,
      warehouse_id: supplierReturns.warehouse_id,
      project_id: supplierReturns.project_id,
      return_date: supplierReturns.return_date,
      status: supplierReturns.status,
      reason: supplierReturns.reason,
      notes: supplierReturns.notes,
      posted_at: supplierReturns.posted_at,
      supplier_name: sql<string | null>`(select name from suppliers s where s.id = ${supplierReturns.supplier_id})`,
      warehouse_name: sql<string>`(select name from warehouses w where w.id = ${supplierReturns.warehouse_id})`,
    })
    .from(supplierReturns)
    .where(eq(supplierReturns.id, params.id))
    .limit(1);
  if (!doc) return ok(null);
  const items = await db
    .select({
      id: returnItems.id,
      material_id: returnItems.material_id,
      qty: returnItems.qty,
      note: returnItems.note,
      material_code: sql<string>`(select code from materials m where m.id = ${returnItems.material_id})`,
      material_name: sql<string>`(select name from materials m where m.id = ${returnItems.material_id})`,
      unit: sql<string>`(select unit from materials m where m.id = ${returnItems.material_id})`,
    })
    .from(returnItems)
    .where(eq(returnItems.return_id, params.id));
  return ok({ ...doc, items });
});

export const POST = api(async (req, meta, params) => {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "post") {
    await postSupplierReturn(meta.ctx, params.id);
    return ok({ ok: true });
  }
  if (action === "delete") {
    await deleteDraftSupplierReturn(meta.ctx, params.id);
    return ok({ ok: true });
  }
  throw new Error("Unknown action");
});
