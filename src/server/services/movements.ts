import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  receipts,
  receiptItems,
  issues,
  issueItems,
  transfers,
  transferItems,
  supplierReturns,
  returnItems,
  stockTransactions,
  warehouses,
  materials,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { withNumberRetry } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requirePermission, hasProjectAccess, isGlobalProjectRole } from "@/server/auth/context";
import { d } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";
import {
  assertQtyPositive,
  stockForWarehouseMaterial,
  negativeStockAllowed,
  warehouseProjectId,
} from "./inventory";

const docItemSchema = z.object({
  material_id: z.string().uuid(),
  qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  note: z.string().max(500).optional().nullable(),
  unit_cost: z.string().regex(/^\d+(\.\d{1,3})?$/).optional().nullable(),
});

function docNumber(rows: { number: string }[], prefix: string): string {
  let max = 0;
  for (const r of rows) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r.number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

async function ensureVisible(ctx: Ctx, projectId: string | null) {
  if (!projectId) return;
  if (isGlobalProjectRole(ctx.actor.role)) return;
  if (!(await hasProjectAccess(ctx.actor, projectId))) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
}

type _AnyCol = { __brand?: never };

async function visibleProjectCondition(ctx: Ctx, col: unknown) {
  if (isGlobalProjectRole(ctx.actor.role)) return undefined;
  const { db } = ctx;
  const membership = await db.execute(
    sql`select project_id from project_members where user_id = ${ctx.actor.id}`,
  );
  const ids = (membership as unknown as { project_id: string }[]).map((r) => r.project_id);
  if (!ids.length) return sql`false`;
  return or(isNull(col as never), inArray(col as never, ids));
}

async function insertLedger(
  db: Ctx["db"],
  rows: {
    txn_type: "receipt" | "issue" | "transfer_in" | "transfer_out" | "supplier_return";
    warehouse_id: string;
    material_id: string;
    project_id: string | null;
    qty: string;
    unit_cost?: string | null;
    ref_type: string;
    ref_id: string;
    note?: string | null;
  }[],
  actorId: string,
) {
  if (!rows.length) return;
  await db.insert(stockTransactions).values(
    rows.map((r) => ({
      ...r,
      unit_cost: r.unit_cost ?? null,
      note: r.note ?? null,
      posted_by: actorId,
    })),
  );
}

async function assertStockAvailable(
  db: Ctx["db"],
  warehouseId: string,
  materialId: string,
  qty: string,
  materialName: string,
  unit: string,
  warehouseName: string,
) {
  const available = await stockForWarehouseMaterial(db, warehouseId, materialId);
  if (d(available).lessThan(d(qty))) {
    const allowed = await negativeStockAllowed(db, warehouseId);
    if (!allowed) {
      throw new AppError(
        "INSUFFICIENT_STOCK",
        `Insufficient stock for ${materialName}`,
        {
          i18nKey: "errors.insufficientStock",
          params: {
            material: materialName,
            required: qty,
            available,
            unit,
            warehouse: warehouseName,
          },
        },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Receipts (GRN)
// ---------------------------------------------------------------------------

export const receiptSchema = z.object({
  supplier_id: z.string().uuid().optional().nullable(),
  warehouse_id: z.string().uuid(),
  project_id: z.string().uuid().optional().nullable(),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(docItemSchema).min(1),
});

export async function listReceipts(ctx: Ctx, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx.actor, "inventory:transact");
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];
  if (opts.status) conds.push(eq(receipts.status, opts.status as never));
  const vis = await visibleProjectCondition(ctx, receipts.project_id);
  if (vis) conds.push(vis);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: receipts.id,
        number: receipts.number,
        receipt_date: receipts.receipt_date,
        status: receipts.status,
        posted_at: receipts.posted_at,
        notes: receipts.notes,
        supplier_name: sql<string | null>`(select name from suppliers s where s.id = ${receipts.supplier_id})`,
        warehouse_name: sql<string>`(select name from warehouses w where w.id = ${receipts.warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${receipts.project_id})`,
        item_count: sql<number>`(select count(*)::int from receipt_items ri where ri.receipt_id = ${receipts.id})`,
      })
      .from(receipts)
      .where(where)
      .orderBy(desc(receipts.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(receipts)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function getReceipt(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db
    .select({
      id: receipts.id,
      number: receipts.number,
      supplier_id: receipts.supplier_id,
      warehouse_id: receipts.warehouse_id,
      project_id: receipts.project_id,
      receipt_date: receipts.receipt_date,
      status: receipts.status,
      notes: receipts.notes,
      posted_at: receipts.posted_at,
      received_by: receipts.received_by,
      supplier_name: sql<string | null>`(select name from suppliers s where s.id = ${receipts.supplier_id})`,
      warehouse_name: sql<string>`(select name from warehouses w where w.id = ${receipts.warehouse_id})`,
      project_code: sql<string | null>`(select code from projects p where p.id = ${receipts.project_id})`,
      receiver_name: sql<string | null>`(select name from users u where u.id = ${receipts.received_by})`,
    })
    .from(receipts)
    .where(eq(receipts.id, id))
    .limit(1);
  if (!doc) notFound("Receipt");
  await ensureVisible(ctx, doc.project_id);
  const items = await ctx.db
    .select({
      id: receiptItems.id,
      material_id: receiptItems.material_id,
      qty: receiptItems.qty,
      unit_cost: receiptItems.unit_cost,
      note: receiptItems.note,
      material_code: sql<string>`(select code from materials m where m.id = ${receiptItems.material_id})`,
      material_name: sql<string>`(select name from materials m where m.id = ${receiptItems.material_id})`,
      unit: sql<string>`(select unit from materials m where m.id = ${receiptItems.material_id})`,
    })
    .from(receiptItems)
    .where(eq(receiptItems.receipt_id, id));
  return { ...doc, items };
}

export async function createReceipt(ctx: Ctx, input: z.infer<typeof receiptSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = receiptSchema.parse(input);
  for (const it of data.items) assertQtyPositive(it.qty);
  const [wh] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.warehouse_id)).limit(1);
  if (!wh) notFound("Warehouse");
  const projectId = data.project_id ?? (await warehouseProjectId(ctx.db, data.warehouse_id));
  await ensureVisible(ctx, projectId);

  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const numbers = await db.select({ number: receipts.number }).from(receipts);
    const number = docNumber(numbers, "GRN");
    const id = newId();
    await db.insert(receipts).values({
      id,
      number,
      supplier_id: data.supplier_id ?? null,
      warehouse_id: data.warehouse_id,
      project_id: projectId,
      receipt_date: data.receipt_date,
      notes: data.notes ?? null,
      received_by: ctx.actor.id,
      status: "draft",
    });
    await db.insert(receiptItems).values(
      data.items.map((it) => ({
        receipt_id: id,
        material_id: it.material_id,
        qty: it.qty,
        unit_cost: it.unit_cost ?? null,
        note: it.note ?? null,
      })),
    );
    await audit(ctxTx, {
      action: "created",
      entityType: "receipt",
      entityId: id,
      projectId,
      after: { number, warehouse: wh.code, items: data.items.length },
    });
    return { id, number };
  });
}

export async function postReceipt(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(receipts)
      .where(eq(receipts.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Receipt");
    if (doc.status !== "draft") {
      throw new AppError("INVALID_STATE", "Only draft receipts can be posted", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await ensureVisible(ctxTx, doc.project_id);
    const items = await tx.select().from(receiptItems).where(eq(receiptItems.receipt_id, id));
    if (!items.length) validation("Receipt has no items");
    await insertLedger(
      tx as never,
      items.map((it) => ({
        txn_type: "receipt",
        warehouse_id: doc.warehouse_id,
        material_id: it.material_id,
        project_id: doc.project_id,
        qty: it.qty,
        unit_cost: it.unit_cost,
        ref_type: "receipt",
        ref_id: doc.number,
        note: it.note,
      })),
      ctx.actor.id,
    );
    await tx
      .update(receipts)
      .set({ status: "posted", posted_at: new Date().toISOString(), received_by: ctx.actor.id })
      .where(eq(receipts.id, id));
    await audit(ctxTx, {
      action: "posted",
      entityType: "receipt",
      entityId: id,
      projectId: doc.project_id,
      after: { number: doc.number },
    });
  });
}

export async function deleteDraftReceipt(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  if (!doc) notFound("Receipt");
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATE", "Posted documents cannot be deleted", { i18nKey: "errors.postedLocked" });
  }
  await ensureVisible(ctx, doc.project_id);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(receiptItems).where(eq(receiptItems.receipt_id, id));
    await tx.delete(receipts).where(eq(receipts.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "receipt",
      entityId: id,
      projectId: doc.project_id,
      before: { number: doc.number },
    });
  });
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const issueSchema = z.object({
  warehouse_id: z.string().uuid(),
  project_id: z.string().uuid().optional().nullable(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requested_by: z.string().max(150).optional().nullable(),
  purpose: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(docItemSchema).min(1),
});

export async function listIssues(ctx: Ctx, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx.actor, "inventory:transact");
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];
  if (opts.status) conds.push(eq(issues.status, opts.status as never));
  const vis = await visibleProjectCondition(ctx, issues.project_id);
  if (vis) conds.push(vis);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: issues.id,
        number: issues.number,
        issue_date: issues.issue_date,
        status: issues.status,
        posted_at: issues.posted_at,
        purpose: issues.purpose,
        requested_by: issues.requested_by,
        warehouse_name: sql<string>`(select name from warehouses w where w.id = ${issues.warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${issues.project_id})`,
        item_count: sql<number>`(select count(*)::int from issue_items ii where ii.issue_id = ${issues.id})`,
      })
      .from(issues)
      .where(where)
      .orderBy(desc(issues.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(issues)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function getIssue(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db
    .select({
      id: issues.id,
      number: issues.number,
      warehouse_id: issues.warehouse_id,
      project_id: issues.project_id,
      issue_date: issues.issue_date,
      status: issues.status,
      requested_by: issues.requested_by,
      purpose: issues.purpose,
      notes: issues.notes,
      posted_at: issues.posted_at,
      issued_by: issues.issued_by,
      warehouse_name: sql<string>`(select name from warehouses w where w.id = ${issues.warehouse_id})`,
      project_code: sql<string | null>`(select code from projects p where p.id = ${issues.project_id})`,
      issuer_name: sql<string | null>`(select name from users u where u.id = ${issues.issued_by})`,
    })
    .from(issues)
    .where(eq(issues.id, id))
    .limit(1);
  if (!doc) notFound("Issue");
  await ensureVisible(ctx, doc.project_id);
  const items = await ctx.db
    .select({
      id: issueItems.id,
      material_id: issueItems.material_id,
      qty: issueItems.qty,
      note: issueItems.note,
      material_code: sql<string>`(select code from materials m where m.id = ${issueItems.material_id})`,
      material_name: sql<string>`(select name from materials m where m.id = ${issueItems.material_id})`,
      unit: sql<string>`(select unit from materials m where m.id = ${issueItems.material_id})`,
    })
    .from(issueItems)
    .where(eq(issueItems.issue_id, id));
  return { ...doc, items };
}

export async function createIssue(ctx: Ctx, input: z.infer<typeof issueSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = issueSchema.parse(input);
  for (const it of data.items) assertQtyPositive(it.qty);
  const [wh] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.warehouse_id)).limit(1);
  if (!wh) notFound("Warehouse");
  const projectId = data.project_id ?? (await warehouseProjectId(ctx.db, data.warehouse_id));
  await ensureVisible(ctx, projectId);

  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const numbers = await db.select({ number: issues.number }).from(issues);
    const number = docNumber(numbers, "ISS");
    const id = newId();
    await db.insert(issues).values({
      id,
      number,
      warehouse_id: data.warehouse_id,
      project_id: projectId,
      issue_date: data.issue_date,
      requested_by: data.requested_by ?? null,
      purpose: data.purpose ?? null,
      notes: data.notes ?? null,
      issued_by: ctx.actor.id,
      status: "draft",
    });
    await db.insert(issueItems).values(
      data.items.map((it) => ({
        issue_id: id,
        material_id: it.material_id,
        qty: it.qty,
        note: it.note ?? null,
      })),
    );
    await audit(ctxTx, {
      action: "created",
      entityType: "issue",
      entityId: id,
      projectId,
      after: { number, warehouse: wh.code, items: data.items.length },
    });
    return { id, number };
  });
}

export async function postIssue(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(issues)
      .where(eq(issues.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Issue");
    if (doc.status !== "draft") {
      throw new AppError("INVALID_STATE", "Only draft issues can be posted", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await ensureVisible(ctxTx, doc.project_id);
    const items = await tx.select().from(issueItems).where(eq(issueItems.issue_id, id));
    if (!items.length) validation("Issue has no items");
    const [wh] = await tx.select().from(warehouses).where(eq(warehouses.id, doc.warehouse_id)).limit(1);
    if (!wh) notFound("Warehouse");
    for (const it of items) {
      const [mat] = await tx.select().from(materials).where(eq(materials.id, it.material_id)).limit(1);
      if (!mat) notFound("Material");
      await assertStockAvailable(tx as never, doc.warehouse_id, it.material_id, it.qty, mat.name, mat.unit, wh.name);
    }
    await insertLedger(
      tx as never,
      items.map((it) => ({
        txn_type: "issue",
        warehouse_id: doc.warehouse_id,
        material_id: it.material_id,
        project_id: doc.project_id,
        qty: d(it.qty).negated().toString(),
        ref_type: "issue",
        ref_id: doc.number,
        note: it.note,
      })),
      ctx.actor.id,
    );
    await tx
      .update(issues)
      .set({ status: "posted", posted_at: new Date().toISOString(), issued_by: ctx.actor.id })
      .where(eq(issues.id, id));
    await audit(ctxTx, {
      action: "posted",
      entityType: "issue",
      entityId: id,
      projectId: doc.project_id,
      after: { number: doc.number },
    });
  });
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export const transferSchema = z.object({
  from_warehouse_id: z.string().uuid(),
  to_warehouse_id: z.string().uuid(),
  project_id: z.string().uuid().optional().nullable(),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(docItemSchema).min(1),
});

export async function listTransfers(ctx: Ctx, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx.actor, "inventory:transact");
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];
  if (opts.status) conds.push(eq(transfers.status, opts.status as never));
  const vis = await visibleProjectCondition(ctx, transfers.project_id);
  if (vis) conds.push(vis);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: transfers.id,
        number: transfers.number,
        transfer_date: transfers.transfer_date,
        status: transfers.status,
        posted_at: transfers.posted_at,
        from_name: sql<string>`(select name from warehouses w where w.id = ${transfers.from_warehouse_id})`,
        to_name: sql<string>`(select name from warehouses w where w.id = ${transfers.to_warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${transfers.project_id})`,
        item_count: sql<number>`(select count(*)::int from transfer_items ti where ti.transfer_id = ${transfers.id})`,
      })
      .from(transfers)
      .where(where)
      .orderBy(desc(transfers.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(transfers)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function createTransfer(ctx: Ctx, input: z.infer<typeof transferSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = transferSchema.parse(input);
  if (data.from_warehouse_id === data.to_warehouse_id) {
    validation("Source and destination warehouses must be different", {
      i18nKey: "errors.sameWarehouse",
    });
  }
  for (const it of data.items) assertQtyPositive(it.qty);
  const [from] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.from_warehouse_id)).limit(1);
  const [to] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.to_warehouse_id)).limit(1);
  if (!from || !to) notFound("Warehouse");
  const projectId =
    data.project_id ??
    (await warehouseProjectId(ctx.db, data.from_warehouse_id)) ??
    (await warehouseProjectId(ctx.db, data.to_warehouse_id));
  await ensureVisible(ctx, projectId);

  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const numbers = await db.select({ number: transfers.number }).from(transfers);
    const number = docNumber(numbers, "TRN");
    const id = newId();
    await db.insert(transfers).values({
      id,
      number,
      from_warehouse_id: data.from_warehouse_id,
      to_warehouse_id: data.to_warehouse_id,
      project_id: projectId,
      transfer_date: data.transfer_date,
      notes: data.notes ?? null,
      created_by: ctx.actor.id,
      status: "draft",
    });
    await db.insert(transferItems).values(
      data.items.map((it) => ({
        transfer_id: id,
        material_id: it.material_id,
        qty: it.qty,
        note: it.note ?? null,
      })),
    );
    await audit(ctxTx, {
      action: "created",
      entityType: "transfer",
      entityId: id,
      projectId,
      after: { number, from: from.code, to: to.code },
    });
    return { id, number };
  });
}

export async function postTransfer(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Transfer");
    if (doc.status !== "draft") {
      throw new AppError("INVALID_STATE", "Only draft transfers can be posted", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await ensureVisible(ctxTx, doc.project_id);
    const items = await tx.select().from(transferItems).where(eq(transferItems.transfer_id, id));
    if (!items.length) validation("Transfer has no items");
    const [from] = await tx.select().from(warehouses).where(eq(warehouses.id, doc.from_warehouse_id)).limit(1);
    if (!from) notFound("Warehouse");
    for (const it of items) {
      const [mat] = await tx.select().from(materials).where(eq(materials.id, it.material_id)).limit(1);
      if (!mat) notFound("Material");
      await assertStockAvailable(tx as never, doc.from_warehouse_id, it.material_id, it.qty, mat.name, mat.unit, from.name);
    }
    await insertLedger(
      tx as never,
      items.flatMap((it) => [
        {
          txn_type: "transfer_out" as const,
          warehouse_id: doc.from_warehouse_id,
          material_id: it.material_id,
          project_id: doc.project_id,
          qty: d(it.qty).negated().toString(),
          ref_type: "transfer",
          ref_id: doc.number,
          note: it.note,
        },
        {
          txn_type: "transfer_in" as const,
          warehouse_id: doc.to_warehouse_id,
          material_id: it.material_id,
          project_id: doc.project_id,
          qty: it.qty,
          ref_type: "transfer",
          ref_id: doc.number,
          note: it.note,
        },
      ]),
      ctx.actor.id,
    );
    await tx
      .update(transfers)
      .set({ status: "posted", posted_at: new Date().toISOString() })
      .where(eq(transfers.id, id));
    await audit(ctxTx, {
      action: "posted",
      entityType: "transfer",
      entityId: id,
      projectId: doc.project_id,
      after: { number: doc.number },
    });
  });
}

// ---------------------------------------------------------------------------
// Supplier returns
// ---------------------------------------------------------------------------

export const returnSchema = z.object({
  supplier_id: z.string().uuid().optional().nullable(),
  warehouse_id: z.string().uuid(),
  project_id: z.string().uuid().optional().nullable(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(docItemSchema).min(1),
});

export async function listReturns(ctx: Ctx, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx.actor, "inventory:transact");
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];
  if (opts.status) conds.push(eq(supplierReturns.status, opts.status as never));
  const vis = await visibleProjectCondition(ctx, supplierReturns.project_id);
  if (vis) conds.push(vis);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: supplierReturns.id,
        number: supplierReturns.number,
        return_date: supplierReturns.return_date,
        status: supplierReturns.status,
        posted_at: supplierReturns.posted_at,
        reason: supplierReturns.reason,
        supplier_name: sql<string | null>`(select name from suppliers s where s.id = ${supplierReturns.supplier_id})`,
        warehouse_name: sql<string>`(select name from warehouses w where w.id = ${supplierReturns.warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${supplierReturns.project_id})`,
        item_count: sql<number>`(select count(*)::int from return_items ri where ri.return_id = ${supplierReturns.id})`,
      })
      .from(supplierReturns)
      .where(where)
      .orderBy(desc(supplierReturns.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(supplierReturns)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function createSupplierReturn(ctx: Ctx, input: z.infer<typeof returnSchema>) {
  requirePermission(ctx.actor, "inventory:transact");
  const data = returnSchema.parse(input);
  for (const it of data.items) assertQtyPositive(it.qty);
  const [wh] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.warehouse_id)).limit(1);
  if (!wh) notFound("Warehouse");
  const projectId = data.project_id ?? (await warehouseProjectId(ctx.db, data.warehouse_id));
  await ensureVisible(ctx, projectId);

  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const numbers = await db.select({ number: supplierReturns.number }).from(supplierReturns);
    const number = docNumber(numbers, "RET");
    const id = newId();
    await db.insert(supplierReturns).values({
      id,
      number,
      supplier_id: data.supplier_id ?? null,
      warehouse_id: data.warehouse_id,
      project_id: projectId,
      return_date: data.return_date,
      reason: data.reason ?? null,
      notes: data.notes ?? null,
      status: "draft",
    });
    await db.insert(returnItems).values(
      data.items.map((it) => ({
        return_id: id,
        material_id: it.material_id,
        qty: it.qty,
        note: it.note ?? null,
      })),
    );
    await audit(ctxTx, {
      action: "created",
      entityType: "supplier_return",
      entityId: id,
      projectId,
      after: { number, warehouse: wh.code },
    });
    return { id, number };
  });
}

export async function postSupplierReturn(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(supplierReturns)
      .where(eq(supplierReturns.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Supplier return");
    if (doc.status !== "draft") {
      throw new AppError("INVALID_STATE", "Only draft returns can be posted", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await ensureVisible(ctxTx, doc.project_id);
    const items = await tx.select().from(returnItems).where(eq(returnItems.return_id, id));
    if (!items.length) validation("Return has no items");
    const [wh] = await tx.select().from(warehouses).where(eq(warehouses.id, doc.warehouse_id)).limit(1);
    if (!wh) notFound("Warehouse");
    for (const it of items) {
      const [mat] = await tx.select().from(materials).where(eq(materials.id, it.material_id)).limit(1);
      if (!mat) notFound("Material");
      await assertStockAvailable(tx as never, doc.warehouse_id, it.material_id, it.qty, mat.name, mat.unit, wh.name);
    }
    await insertLedger(
      tx as never,
      items.map((it) => ({
        txn_type: "supplier_return",
        warehouse_id: doc.warehouse_id,
        material_id: it.material_id,
        project_id: doc.project_id,
        qty: d(it.qty).negated().toString(),
        ref_type: "supplier_return",
        ref_id: doc.number,
        note: it.note,
      })),
      ctx.actor.id,
    );
    await tx
      .update(supplierReturns)
      .set({ status: "posted", posted_at: new Date().toISOString() })
      .where(eq(supplierReturns.id, id));
    await audit(ctxTx, {
      action: "posted",
      entityType: "supplier_return",
      entityId: id,
      projectId: doc.project_id,
      after: { number: doc.number },
    });
  });
}

export async function deleteDraftIssue(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db.select().from(issues).where(eq(issues.id, id)).limit(1);
  if (!doc) notFound("Issue");
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATE", "Posted documents cannot be deleted", { i18nKey: "errors.postedLocked" });
  }
  await ensureVisible(ctx, doc.project_id);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(issueItems).where(eq(issueItems.issue_id, id));
    await tx.delete(issues).where(eq(issues.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "issue",
      entityId: id,
      projectId: doc.project_id,
      before: { number: doc.number },
    });
  });
}

export async function deleteDraftTransfer(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db.select().from(transfers).where(eq(transfers.id, id)).limit(1);
  if (!doc) notFound("Transfer");
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATE", "Posted documents cannot be deleted", { i18nKey: "errors.postedLocked" });
  }
  await ensureVisible(ctx, doc.project_id);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(transferItems).where(eq(transferItems.transfer_id, id));
    await tx.delete(transfers).where(eq(transfers.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "transfer",
      entityId: id,
      projectId: doc.project_id,
      before: { number: doc.number },
    });
  });
}

export async function deleteDraftSupplierReturn(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:transact");
  const [doc] = await ctx.db.select().from(supplierReturns).where(eq(supplierReturns.id, id)).limit(1);
  if (!doc) notFound("Supplier return");
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATE", "Posted documents cannot be deleted", { i18nKey: "errors.postedLocked" });
  }
  await ensureVisible(ctx, doc.project_id);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(returnItems).where(eq(returnItems.return_id, id));
    await tx.delete(supplierReturns).where(eq(supplierReturns.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "supplier_return",
      entityId: id,
      projectId: doc.project_id,
      before: { number: doc.number },
    });
  });
}
