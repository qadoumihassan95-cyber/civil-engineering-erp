import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adjustments,
  adjustmentItems,
  stockTransactions,
  warehouses,
  materials,
  projects,
  type AdjustmentStatus,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { withNumberRetry } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requirePermission, hasPermission, hasProjectAccess, isGlobalProjectRole } from "@/server/auth/context";
import { d, isZero } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";
import { stockForWarehouseMaterial, negativeStockAllowed } from "./inventory";

const TRANSITIONS: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  draft: ["submitted", "posted"],
  submitted: ["approved", "rejected"],
  approved: ["posted"],
  rejected: [],
  posted: [],
};

export const adjustmentSchema = z.object({
  warehouse_id: z.string().uuid(),
  project_id: z.string().uuid().optional().nullable(),
  adjustment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3).max(2000),
  notes: z.string().max(2000).optional().nullable(),
  evidence_file_id: z.string().uuid().optional().nullable(),
  items: z
    .array(
      z.object({
        material_id: z.string().uuid(),
        qty_diff: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1),
});

export async function adjustmentPolicy(ctx: Ctx, projectId: string | null): Promise<"simple" | "controlled"> {
  if (!projectId) return "controlled";
  const [p] = await ctx.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const settings = (p?.settings ?? {}) as { stockAdjustmentPolicy?: string };
  return settings.stockAdjustmentPolicy === "simple" ? "simple" : "controlled";
}

async function visibleCondition(ctx: Ctx) {
  if (isGlobalProjectRole(ctx.actor.role)) return undefined;
  const membership = await ctx.db.execute(
    sql`select project_id from project_members where user_id = ${ctx.actor.id}`,
  );
  const ids = (membership as unknown as { project_id: string }[]).map((r) => r.project_id);
  if (!ids.length) return sql`false`;
  return or(isNull(adjustments.project_id), inArray(adjustments.project_id, ids));
}

export async function listAdjustments(ctx: Ctx, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx.actor, "inventory:adjust");
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];
  if (opts.status) conds.push(eq(adjustments.status, opts.status as AdjustmentStatus));
  const vis = await visibleCondition(ctx);
  if (vis) conds.push(vis);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: adjustments.id,
        number: adjustments.number,
        adjustment_date: adjustments.adjustment_date,
        status: adjustments.status,
        policy: adjustments.policy,
        reason: adjustments.reason,
        posted_at: adjustments.posted_at,
        submitted_at: adjustments.submitted_at,
        approved_at: adjustments.approved_at,
        warehouse_name: sql<string>`(select name from warehouses w where w.id = ${adjustments.warehouse_id})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${adjustments.project_id})`,
        created_by_name: sql<string | null>`(select name from users u where u.id = ${adjustments.created_by})`,
        approved_by_name: sql<string | null>`(select name from users u where u.id = ${adjustments.approved_by})`,
        item_count: sql<number>`(select count(*)::int from adjustment_items ai where ai.adjustment_id = ${adjustments.id})`,
      })
      .from(adjustments)
      .where(where)
      .orderBy(desc(adjustments.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(adjustments)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function getAdjustment(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:adjust");
  const [doc] = await ctx.db
    .select({
      id: adjustments.id,
      number: adjustments.number,
      warehouse_id: adjustments.warehouse_id,
      project_id: adjustments.project_id,
      adjustment_date: adjustments.adjustment_date,
      status: adjustments.status,
      policy: adjustments.policy,
      reason: adjustments.reason,
      notes: adjustments.notes,
      evidence_file_id: adjustments.evidence_file_id,
      created_by: adjustments.created_by,
      submitted_at: adjustments.submitted_at,
      approved_by: adjustments.approved_by,
      approved_at: adjustments.approved_at,
      posted_by: adjustments.posted_by,
      posted_at: adjustments.posted_at,
      created_at: adjustments.created_at,
      warehouse_name: sql<string>`(select name from warehouses w where w.id = ${adjustments.warehouse_id})`,
      project_code: sql<string | null>`(select code from projects p where p.id = ${adjustments.project_id})`,
      created_by_name: sql<string | null>`(select name from users u where u.id = ${adjustments.created_by})`,
      approved_by_name: sql<string | null>`(select name from users u where u.id = ${adjustments.approved_by})`,
      posted_by_name: sql<string | null>`(select name from users u where u.id = ${adjustments.posted_by})`,
      evidence_name: sql<string | null>`(select name from files f where f.id = ${adjustments.evidence_file_id})`,
    })
    .from(adjustments)
    .where(eq(adjustments.id, id))
    .limit(1);
  if (!doc) notFound("Adjustment");
  if (doc.project_id && !(await hasProjectAccess(ctx.actor, doc.project_id)) && !isGlobalProjectRole(ctx.actor.role)) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
  const items = await ctx.db
    .select({
      id: adjustmentItems.id,
      material_id: adjustmentItems.material_id,
      qty_diff: adjustmentItems.qty_diff,
      note: adjustmentItems.note,
      material_code: sql<string>`(select code from materials m where m.id = ${adjustmentItems.material_id})`,
      material_name: sql<string>`(select name from materials m where m.id = ${adjustmentItems.material_id})`,
      unit: sql<string>`(select unit from materials m where m.id = ${adjustmentItems.material_id})`,
    })
    .from(adjustmentItems)
    .where(eq(adjustmentItems.adjustment_id, id));
  return { ...doc, items };
}

export async function createAdjustment(ctx: Ctx, input: z.infer<typeof adjustmentSchema>) {
  requirePermission(ctx.actor, "inventory:adjust");
  const data = adjustmentSchema.parse(input);
  for (const it of data.items) {
    if (isZero(it.qty_diff)) {
      validation("Adjustment quantities cannot be zero", { i18nKey: "errors.qtyPositive" });
    }
  }
  const [wh] = await ctx.db.select().from(warehouses).where(eq(warehouses.id, data.warehouse_id)).limit(1);
  if (!wh) notFound("Warehouse");
  const projectId = data.project_id ?? wh.project_id;
  if (projectId && !(await hasProjectAccess(ctx.actor, projectId)) && !isGlobalProjectRole(ctx.actor.role)) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
  const policy = await adjustmentPolicy(ctx, projectId);

  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const rows = await db.select({ number: adjustments.number }).from(adjustments);
    let max = 0;
    for (const r of rows) {
      const m = /^ADJ-(\d+)$/.exec(r.number);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const number = `ADJ-${String(max + 1).padStart(4, "0")}`;
    const id = newId();
    await db.insert(adjustments).values({
      id,
      number,
      warehouse_id: data.warehouse_id,
      project_id: projectId,
      adjustment_date: data.adjustment_date,
      status: "draft",
      policy,
      reason: data.reason,
      notes: data.notes ?? null,
      evidence_file_id: data.evidence_file_id ?? null,
      created_by: ctx.actor.id,
    });
    await db.insert(adjustmentItems).values(
      data.items.map((it) => ({
        adjustment_id: id,
        material_id: it.material_id,
        qty_diff: it.qty_diff,
        note: it.note ?? null,
      })),
    );
    await audit(ctxTx, {
      action: "created",
      entityType: "adjustment",
      entityId: id,
      projectId,
      after: { number, policy, reason: data.reason },
    });
    return { id, number, policy };
  });
}

export async function submitAdjustment(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:adjust");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(adjustments)
      .where(eq(adjustments.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Adjustment");
    if (doc.policy !== "controlled") {
      throw new AppError("INVALID_STATE", "Simple-policy adjustments do not require approval", {
        i18nKey: "errors.invalidTransition",
      });
    }
    if (!TRANSITIONS[doc.status].includes("submitted")) {
      throw new AppError("INVALID_STATE", `Cannot submit from ${doc.status}`, {
        i18nKey: "errors.invalidTransition",
      });
    }
    await tx
      .update(adjustments)
      .set({ status: "submitted", submitted_at: new Date().toISOString() })
      .where(eq(adjustments.id, id));
    await audit(ctxTx, {
      action: "submitted",
      entityType: "adjustment",
      entityId: id,
      projectId: doc.project_id,
      before: { status: doc.status },
      after: { status: "submitted" },
    });
  });
}

export async function approveAdjustment(
  ctx: Ctx,
  id: string,
  input: { decision: "approved" | "rejected"; comment?: string | null },
) {
  const hasAnyApprovalPerm =
    hasPermission(ctx.actor.role, "inventory:adjust") || hasPermission(ctx.actor.role, "financial:view");
  if (!hasAnyApprovalPerm) {
    throw new AppError("FORBIDDEN", "Your role cannot approve adjustments", {
      i18nKey: "errors.forbidden",
    });
  }
  const approverRoles = new Set(["super_admin", "owner", "general_manager", "project_manager", "accountant"]);
  if (!approverRoles.has(ctx.actor.role)) {
    throw new AppError("FORBIDDEN", "Your role cannot approve adjustments", {
      i18nKey: "errors.forbidden",
    });
  }
  if (input.decision === "rejected" && !input.comment?.trim()) {
    validation("A comment is required when rejecting", { i18nKey: "errors.validation" });
  }
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(adjustments)
      .where(eq(adjustments.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Adjustment");
    if (doc.policy !== "controlled") {
      throw new AppError("INVALID_STATE", "Simple-policy adjustments do not require approval", {
        i18nKey: "errors.invalidTransition",
      });
    }
    if (doc.status !== "submitted") {
      throw new AppError("INVALID_STATE", "Only submitted adjustments can be reviewed", {
        i18nKey: "errors.invalidTransition",
      });
    }
    if (doc.created_by === ctx.actor.id && ctx.actor.role !== "super_admin") {
      throw new AppError(
        "SEPARATION_OF_DUTIES",
        "You cannot approve an adjustment you created. A different approver is required.",
        { i18nKey: "errors.selfApproval" },
      );
    }
    await tx
      .update(adjustments)
      .set({
        status: input.decision,
        approved_by: ctx.actor.id,
        approved_at: new Date().toISOString(),
        notes: input.comment ? (doc.notes ? `${doc.notes}\n${input.comment}` : input.comment) : doc.notes,
      })
      .where(eq(adjustments.id, id));
    await audit(ctxTx, {
      action: input.decision,
      entityType: "adjustment",
      entityId: id,
      projectId: doc.project_id,
      before: { status: "submitted" },
      after: { status: input.decision, comment: input.comment ?? null },
    });
  });
}

export async function postAdjustment(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:adjust");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [doc] = await tx
      .select()
      .from(adjustments)
      .where(eq(adjustments.id, id))
      .limit(1)
      .for("update");
    if (!doc) notFound("Adjustment");
    const allowed = doc.policy === "simple" ? doc.status === "draft" : doc.status === "approved";
    if (!allowed) {
      throw new AppError(
        "INVALID_STATE",
        doc.policy === "simple"
          ? "Only draft adjustments can be posted"
          : "Adjustment must be approved before posting",
        { i18nKey: "errors.invalidTransition" },
      );
    }
    const items = await tx.select().from(adjustmentItems).where(eq(adjustmentItems.adjustment_id, id));
    if (!items.length) validation("Adjustment has no items");
    const [wh] = await tx.select().from(warehouses).where(eq(warehouses.id, doc.warehouse_id)).limit(1);
    if (!wh) notFound("Warehouse");

    for (const it of items) {
      const [mat] = await tx.select().from(materials).where(eq(materials.id, it.material_id)).limit(1);
      if (!mat) notFound("Material");
      const diff = d(it.qty_diff);
      if (diff.isNegative()) {
        const available = await stockForWarehouseMaterial(tx as never, doc.warehouse_id, it.material_id);
        if (d(available).lessThan(diff.abs())) {
          const negAllowed = await negativeStockAllowed(tx as never, doc.warehouse_id);
          if (!negAllowed) {
            throw new AppError(
              "INSUFFICIENT_STOCK",
              `Adjustment would drive ${mat.name} negative`,
              {
                i18nKey: "errors.insufficientStock",
                params: {
                  material: mat.name,
                  required: diff.abs().toString(),
                  available,
                  unit: mat.unit,
                  warehouse: wh.name,
                },
              },
            );
          }
        }
      }
    }

    await tx.insert(stockTransactions).values(
      items.map((it) => ({
        txn_type: "adjustment" as const,
        warehouse_id: doc.warehouse_id,
        material_id: it.material_id,
        project_id: doc.project_id,
        qty: it.qty_diff,
        ref_type: "adjustment",
        ref_id: doc.number,
        note: it.note ?? doc.reason,
        posted_by: ctx.actor.id,
      })),
    );
    await tx
      .update(adjustments)
      .set({ status: "posted", posted_by: ctx.actor.id, posted_at: new Date().toISOString() })
      .where(eq(adjustments.id, id));
    await audit(ctxTx, {
      action: "posted",
      entityType: "adjustment",
      entityId: id,
      projectId: doc.project_id,
      before: { status: doc.status },
      after: { status: "posted", items: items.map((i) => ({ material: i.material_id, diff: i.qty_diff })) },
    });
  });
}

export async function deleteAdjustmentDraft(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "inventory:adjust");
  const [doc] = await ctx.db.select().from(adjustments).where(eq(adjustments.id, id)).limit(1);
  if (!doc) notFound("Adjustment");
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only drafts can be deleted", {
      i18nKey: "errors.postedLocked",
    });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(adjustmentItems).where(eq(adjustmentItems.adjustment_id, id));
    await tx.delete(adjustments).where(eq(adjustments.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "adjustment",
      entityId: id,
      projectId: doc.project_id,
      before: { number: doc.number },
    });
  });
}
