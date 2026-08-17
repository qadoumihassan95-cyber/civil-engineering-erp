import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  materials,
  materialCategories,
  suppliers,
  warehouses,
  stockTransactions,
  projects,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requirePermission } from "@/server/auth/context";
import { newId } from "@/server/lib/ids";

// ---------------------------------------------------------------------------
// Material categories
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  name_ar: z.string().max(120).optional().nullable(),
  is_active: z.boolean().default(true),
});

export async function listCategories(ctx: Ctx) {
  return ctx.db.select().from(materialCategories).orderBy(asc(materialCategories.name));
}

export async function createCategory(ctx: Ctx, input: z.infer<typeof categorySchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = categorySchema.parse(input);
  const id = newId();
  await ctx.db.insert(materialCategories).values({ id, ...data });
  await audit(ctx, {
    action: "created",
    entityType: "material_category",
    entityId: id,
    after: data,
  });
  return { id };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const materialSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  unit: z.string().min(1).max(30),
  description: z.string().max(2000).optional().nullable(),
  min_stock: z.string().regex(/^\d+(\.\d{1,4})?$/).default("0"),
  is_active: z.boolean().default(true),
});

export const updateMaterialSchema = materialSchema.partial().omit({ code: true });

export async function listMaterials(ctx: Ctx, opts: { search?: string; categoryId?: string } = {}) {
  const conds = [];
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(or(ilike(materials.name, s), ilike(materials.code, s), ilike(materials.name_ar, s)));
  }
  if (opts.categoryId) conds.push(eq(materials.category_id, opts.categoryId));
  return ctx.db
    .select({
      id: materials.id,
      code: materials.code,
      name: materials.name,
      name_ar: materials.name_ar,
      unit: materials.unit,
      min_stock: materials.min_stock,
      is_active: materials.is_active,
      category_name: sql<string | null>`(select name from material_categories c where c.id = ${materials.category_id})`,
    })
    .from(materials)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(materials.code));
}

export async function createMaterial(ctx: Ctx, input: z.infer<typeof materialSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = materialSchema.parse(input);
  const id = newId();
  await ctx.db.insert(materials).values({ id, ...data });
  await audit(ctx, {
    action: "created",
    entityType: "material",
    entityId: id,
    after: data,
  });
  return { id };
}

export async function updateMaterial(ctx: Ctx, id: string, input: z.infer<typeof updateMaterialSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = updateMaterialSchema.parse(input);
  const [existing] = await ctx.db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!existing) notFound("Material");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(materials)
      .set({ ...data, updated_at: new Date().toISOString() })
      .where(eq(materials.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "material",
      entityId: id,
      before: { code: existing.code, name: existing.name },
      after: data,
    });
  });
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  contact_person: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable().or(z.literal("")),
  address: z.string().max(250).optional().nullable(),
  tax_number: z.string().max(40).optional().nullable(),
  is_active: z.boolean().default(true),
});

export async function listSuppliers(ctx: Ctx, opts: { search?: string } = {}) {
  const conds = [];
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(or(ilike(suppliers.name, s), ilike(suppliers.contact_person, s)));
  }
  return ctx.db
    .select()
    .from(suppliers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(suppliers.name));
}

export async function createSupplier(ctx: Ctx, input: z.infer<typeof supplierSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = supplierSchema.parse(input);
  const id = newId();
  await ctx.db.insert(suppliers).values({
    id,
    ...data,
    email: data.email === "" ? null : data.email,
  });
  await audit(ctx, { action: "created", entityType: "supplier", entityId: id, after: data });
  return { id };
}

export async function updateSupplier(ctx: Ctx, id: string, input: z.infer<typeof supplierSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = supplierSchema.parse(input);
  const [existing] = await ctx.db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!existing) notFound("Supplier");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(suppliers)
      .set({ ...data, email: data.email === "" ? null : data.email, updated_at: new Date().toISOString() })
      .where(eq(suppliers.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "supplier",
      entityId: id,
      before: { name: existing.name },
      after: data,
    });
  });
}

// ---------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------

export const warehouseSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(150),
  name_ar: z.string().max(150).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
});

export async function listWarehouses(ctx: Ctx) {
  return ctx.db
    .select({
      id: warehouses.id,
      code: warehouses.code,
      name: warehouses.name,
      name_ar: warehouses.name_ar,
      project_id: warehouses.project_id,
      is_active: warehouses.is_active,
      project_code: sql<string | null>`(select code from projects p where p.id = ${warehouses.project_id})`,
    })
    .from(warehouses)
    .orderBy(asc(warehouses.code));
}

export async function createWarehouse(ctx: Ctx, input: z.infer<typeof warehouseSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = warehouseSchema.parse(input);
  const id = newId();
  await ctx.db.insert(warehouses).values({ id, ...data });
  await audit(ctx, { action: "created", entityType: "warehouse", entityId: id, after: data });
  return { id };
}

export async function updateWarehouse(ctx: Ctx, id: string, input: z.infer<typeof warehouseSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = warehouseSchema.parse(input);
  const [existing] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!existing) notFound("Warehouse");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(warehouses)
      .set({ ...data, updated_at: new Date().toISOString() })
      .where(eq(warehouses.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "warehouse",
      entityId: id,
      before: { code: existing.code },
      after: data,
    });
  });
}

// ---------------------------------------------------------------------------
// Stock levels (derived from immutable ledger)
// ---------------------------------------------------------------------------

export interface StockLevel {
  material_id: string;
  warehouse_id: string;
  qty: string;
  last_cost: string | null;
  value: string;
}

export async function getStockLevels(
  ctx: Ctx,
  opts: { warehouseId?: string; materialId?: string; projectId?: string } = {},
): Promise<StockLevel[]> {
  const conds = [];
  if (opts.warehouseId) conds.push(eq(stockTransactions.warehouse_id, opts.warehouseId));
  if (opts.materialId) conds.push(eq(stockTransactions.material_id, opts.materialId));
  if (opts.projectId) conds.push(eq(stockTransactions.project_id, opts.projectId));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await ctx.db
    .select({
      material_id: stockTransactions.material_id,
      warehouse_id: stockTransactions.warehouse_id,
      qty: sql<string>`coalesce(sum(${stockTransactions.qty}), '0')`,
      last_cost: sql<string | null>`(
        select t2.unit_cost from stock_transactions t2
        where t2.material_id = ${stockTransactions.material_id}
          and t2.txn_type = 'receipt' and t2.unit_cost is not null
        order by t2.created_at desc limit 1
      )`,
    })
    .from(stockTransactions)
    .where(where)
    .groupBy(stockTransactions.material_id, stockTransactions.warehouse_id);

  return rows.map((r) => ({
    ...r,
    value: (parseFloat(r.qty) * parseFloat(r.last_cost ?? "0")).toFixed(3),
  }));
}

export interface StockRow extends StockLevel {
  material_code: string;
  material_name: string;
  unit: string;
  warehouse_code: string;
  warehouse_name: string;
  min_stock: string;
}

export async function getStockReport(ctx: Ctx, opts: { warehouseId?: string; search?: string } = {}): Promise<StockRow[]> {
  const levels = await getStockLevels(ctx, opts);
  if (!levels.length) return [];
  const materialIds = [...new Set(levels.map((l) => l.material_id))];
  const warehouseIds = [...new Set(levels.map((l) => l.warehouse_id))];
  const [mats, whs] = await Promise.all([
    ctx.db.select().from(materials).where(inArray(materials.id, materialIds)),
    ctx.db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds)),
  ]);
  const matMap = new Map(mats.map((m) => [m.id, m]));
  const whMap = new Map(whs.map((w) => [w.id, w]));
  const rows = levels
    .map((l) => {
      const m = matMap.get(l.material_id);
      const w = whMap.get(l.warehouse_id);
      if (!m || !w) return null;
      return {
        ...l,
        material_code: m.code,
        material_name: m.name,
        unit: m.unit,
        warehouse_code: w.code,
        warehouse_name: w.name,
        min_stock: m.min_stock,
      };
    })
    .filter((r): r is StockRow => r !== null);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.material_name.toLowerCase().includes(s) ||
        r.material_code.toLowerCase().includes(s) ||
        r.warehouse_name.toLowerCase().includes(s),
    );
  }
  return rows;
}

export async function stockForWarehouseMaterial(db: Ctx["db"], warehouseId: string, materialId: string): Promise<string> {
  const rows = await db
    .select({ q: sql<string>`coalesce(sum(${stockTransactions.qty}), '0')` })
    .from(stockTransactions)
    .where(
      and(
        eq(stockTransactions.warehouse_id, warehouseId),
        eq(stockTransactions.material_id, materialId),
      ),
    );
  return rows[0]?.q ?? "0";
}

export async function getStockLedger(
  ctx: Ctx,
  opts: { warehouseId?: string; materialId?: string; page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const conds = [];
  if (opts.warehouseId) conds.push(eq(stockTransactions.warehouse_id, opts.warehouseId));
  if (opts.materialId) conds.push(eq(stockTransactions.material_id, opts.materialId));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: stockTransactions.id,
        txn_type: stockTransactions.txn_type,
        qty: stockTransactions.qty,
        unit_cost: stockTransactions.unit_cost,
        ref_type: stockTransactions.ref_type,
        ref_id: stockTransactions.ref_id,
        note: stockTransactions.note,
        created_at: stockTransactions.created_at,
        material_code: sql<string>`(select code from materials m where m.id = ${stockTransactions.material_id})`,
        material_name: sql<string>`(select name from materials m where m.id = ${stockTransactions.material_id})`,
        unit: sql<string>`(select unit from materials m where m.id = ${stockTransactions.material_id})`,
        warehouse_code: sql<string>`(select code from warehouses w where w.id = ${stockTransactions.warehouse_id})`,
        warehouse_name: sql<string>`(select name from warehouses w where w.id = ${stockTransactions.warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${stockTransactions.project_id})`,
        poster_name: sql<string | null>`(select name from users u where u.id = ${stockTransactions.posted_by})`,
      })
      .from(stockTransactions)
      .where(where)
      .orderBy(desc(stockTransactions.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(stockTransactions)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function lowStockAlerts(ctx: Ctx) {
  const rows = await ctx.db.execute(sql`
    select m.id, m.code, m.name, m.unit, m.min_stock,
           coalesce(sum(t.qty), 0) as on_hand
    from materials m
    left join stock_transactions t on t.material_id = m.id
    where m.is_active and m.min_stock > 0
    group by m.id, m.code, m.name, m.unit, m.min_stock
    having coalesce(sum(t.qty), 0) < m.min_stock
    order by on_hand asc
  `);
  return rows as unknown as {
    id: string;
    code: string;
    name: string;
    unit: string;
    min_stock: string;
    on_hand: string;
  }[];
}

export function assertQtyPositive(qty: string): void {
  if (!/^\d+(\.\d{1,4})?$/.test(qty) || parseFloat(qty) <= 0) {
    validation("Quantity must be greater than zero", { i18nKey: "errors.qtyPositive" });
  }
}

export async function negativeStockAllowed(db: Ctx["db"], warehouseId: string): Promise<boolean> {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!w || !w.project_id) return false;
  const [p] = await db.select().from(projects).where(eq(projects.id, w.project_id)).limit(1);
  if (!p) return false;
  const settings = (p.settings ?? {}) as { allowNegativeStock?: boolean };
  return settings.allowNegativeStock === true;
}

export async function warehouseProjectId(db: Ctx["db"], warehouseId: string): Promise<string | null> {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  return w?.project_id ?? null;
}

export function materialDisplayName(m: { name: string; name_ar: string | null }, locale: string): string {
  return locale === "ar" && m.name_ar ? m.name_ar : m.name;
}

export function supplierOrUnknown(name: string | null | undefined): string {
  return name ?? "—";
}

export { AppError };
