import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  wir,
  wirEvents,
  boqItems,
  entityFiles,
  files,
  users,
  type WirStatus,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { withNumberRetry } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import {
  requireProjectPermission,
  requireProjectAccess,
  hasPermission,
} from "@/server/auth/context";
import { d } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";

export const createWirSchema = z.object({
  boq_item_id: z.string().uuid(),
  location: z.string().min(1).max(250),
  zone: z.string().max(120).optional().nullable(),
  floor: z.string().max(120).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  submitted_qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  file_ids: z.array(z.string().uuid()).default([]),
});

export const updateWirSchema = createWirSchema.partial().omit({ file_ids: true, boq_item_id: true });

const TRANSITIONS: Record<WirStatus, WirStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["approved", "approved_with_comments", "returned", "rejected"],
  approved: [],
  approved_with_comments: [],
  returned: ["submitted"],
  rejected: [],
};

export function canTransition(from: WirStatus, to: WirStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

const ACTIVE_COMMITTED = "('submitted','under_review','approved','approved_with_comments')";

async function committedQty(ctx: Ctx, boqItemId: string, excludeWirId?: string): Promise<string> {
  const conds = [
    eq(wir.boq_item_id, boqItemId),
    sql`${wir.status} in ${sql.raw(ACTIVE_COMMITTED)}`,
  ];
  const rows = await ctx.db
    .select({ q: sql<string>`coalesce(sum(${wir.submitted_qty}), '0')` })
    .from(wir)
    .where(excludeWirId ? and(...conds, sql`${wir.id} <> ${excludeWirId}`) : and(...conds));
  return rows[0]?.q ?? "0";
}

async function alreadyApprovedQty(ctx: Ctx, boqItemId: string, excludeWirId: string): Promise<string> {
  const rows = await ctx.db
    .select({ q: sql<string>`coalesce(sum(${wir.approved_qty}), '0')` })
    .from(wir)
    .where(
      and(
        eq(wir.boq_item_id, boqItemId),
        sql`${wir.status} in ('approved','approved_with_comments')`,
        sql`${wir.id} <> ${excludeWirId}`,
      ),
    );
  return rows[0]?.q ?? "0";
}

async function assertWithinContract(ctx: Ctx, boqItemId: string, qty: string, excludeWirId: string, what: "submit" | "approve") {
  const [item] = await ctx.db.select().from(boqItems).where(eq(boqItems.id, boqItemId)).limit(1);
  if (!item) notFound("BOQ item");
  const committed = what === "submit" ? await committedQty(ctx, boqItemId, excludeWirId) : await alreadyApprovedQty(ctx, boqItemId, excludeWirId);
  const remaining = d(item.contract_qty).minus(committed);
  if (d(qty).greaterThan(remaining)) {
    throw new AppError(
      "QUANTITY_EXCEEDED",
      `Quantity exceeds remaining contract quantity for BOQ item (${remaining} ${item.unit} remaining)`,
      {
        i18nKey: "errors.quantityExceedsRemaining",
        params: { remaining: remaining.toString(), unit: item.unit },
      },
    );
  }
  return item;
}

async function addEvent(
  ctx: Ctx,
  wirId: string,
  to: WirStatus,
  from: WirStatus | null,
  comment?: string | null,
  snapshot?: Record<string, unknown>,
) {
  await ctx.db.insert(wirEvents).values({
    wir_id: wirId,
    from_status: from,
    to_status: to,
    actor_id: ctx.actor.id,
    actor_name: ctx.actor.name,
    comment: comment ?? null,
    snapshot: snapshot ?? null,
  });
}

export async function listWirs(
  ctx: Ctx,
  projectId: string,
  opts: { status?: string; search?: string; boqItemId?: string } = {},
) {
  await requireProjectAccess(ctx.actor, projectId);
  const conds = [eq(wir.project_id, projectId)];
  if (opts.status) conds.push(eq(wir.status, opts.status as WirStatus));
  if (opts.boqItemId) conds.push(eq(wir.boq_item_id, opts.boqItemId));
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(sql`(${wir.number} ilike ${s} or ${wir.location} ilike ${s} or ${wir.description} ilike ${s})`);
  }
  return ctx.db
    .select({
      id: wir.id,
      number: wir.number,
      status: wir.status,
      location: wir.location,
      zone: wir.zone,
      floor: wir.floor,
      submitted_qty: wir.submitted_qty,
      approved_qty: wir.approved_qty,
      unit: wir.unit,
      description: wir.description,
      submitted_at: wir.submitted_at,
      reviewed_at: wir.reviewed_at,
      revision: wir.revision,
      created_at: wir.created_at,
      engineer_name: users.name,
      reviewer_name: sql<string | null>`(
        select name from users u2 where u2.id = ${wir.reviewer_id}
      )`,
      item_code: sql<string>`(
        select code from boq_items bi where bi.id = ${wir.boq_item_id}
      )`,
      item_description: sql<string>`(
        select description from boq_items bi where bi.id = ${wir.boq_item_id}
      )`,
    })
    .from(wir)
    .leftJoin(users, eq(users.id, wir.engineer_id))
    .where(and(...conds))
    .orderBy(desc(wir.created_at));
}

export async function getWir(ctx: Ctx, projectId: string, wirId: string) {
  await requireProjectAccess(ctx.actor, projectId);
  const [row] = await ctx.db
    .select({
      id: wir.id,
      project_id: wir.project_id,
      boq_item_id: wir.boq_item_id,
      number: wir.number,
      location: wir.location,
      zone: wir.zone,
      floor: wir.floor,
      description: wir.description,
      submitted_qty: wir.submitted_qty,
      approved_qty: wir.approved_qty,
      unit: wir.unit,
      engineer_id: wir.engineer_id,
      reviewer_id: wir.reviewer_id,
      status: wir.status,
      submitted_at: wir.submitted_at,
      reviewed_at: wir.reviewed_at,
      review_comment: wir.review_comment,
      revision: wir.revision,
      created_at: wir.created_at,
      updated_at: wir.updated_at,
      engineer_name: sql<string | null>`(select name from users u where u.id = ${wir.engineer_id})`,
      reviewer_name: sql<string | null>`(select name from users u where u.id = ${wir.reviewer_id})`,
      item_code: sql<string>`(select code from boq_items bi where bi.id = ${wir.boq_item_id})`,
      item_description: sql<string>`(select description from boq_items bi where bi.id = ${wir.boq_item_id})`,
      item_unit: sql<string>`(select unit from boq_items bi where bi.id = ${wir.boq_item_id})`,
      item_contract_qty: sql<string>`(select contract_qty from boq_items bi where bi.id = ${wir.boq_item_id})`,
      item_approved_qty: sql<string>`(
        select coalesce(sum(w2.approved_qty),'0') from wir w2
        where w2.boq_item_id = ${wir.boq_item_id}
          and w2.status in ('approved','approved_with_comments')
      )`,
    })
    .from(wir)
    .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
    .limit(1);
  if (!row) notFound("WIR");
  const [events, attachments] = await Promise.all([
    ctx.db
      .select()
      .from(wirEvents)
      .where(eq(wirEvents.wir_id, wirId))
      .orderBy(asc(wirEvents.created_at)),
    listWirFiles(ctx, wirId),
  ]);
  return { ...row, events, attachments };
}

export async function listWirFiles(ctx: Ctx, wirId: string) {
  return ctx.db
    .select({
      id: files.id,
      name: files.name,
      mime: files.mime,
      size: files.size,
      label: entityFiles.label,
      created_at: entityFiles.created_at,
    })
    .from(entityFiles)
    .innerJoin(files, eq(files.id, entityFiles.file_id))
    .where(and(eq(entityFiles.entity_type, "wir"), eq(entityFiles.entity_id, wirId)))
    .orderBy(asc(entityFiles.created_at));
}

export async function createWirDraft(ctx: Ctx, projectId: string, input: z.infer<typeof createWirSchema>) {
  await requireProjectPermission(ctx.actor, projectId, "wir:create");
  const data = createWirSchema.parse(input);
  const [item] = await ctx.db
    .select()
    .from(boqItems)
    .where(and(eq(boqItems.id, data.boq_item_id), eq(boqItems.project_id, projectId)))
    .limit(1);
  if (!item) {
    throw new AppError("VALIDATION", "BOQ item does not belong to this project", {
      i18nKey: "errors.boqItemMismatch",
    });
  }
  if (!(d(data.submitted_qty).greaterThan(0))) {
    validation("Submitted quantity must be greater than zero", { i18nKey: "errors.qtyPositive" });
  }

  const result = await withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const numbers = await db
      .select({ number: wir.number })
      .from(wir)
      .where(eq(wir.project_id, projectId));
    const number = nextWirNumberSeq(numbers.map((r) => r.number));
    const id = newId();
    await db.insert(wir).values({
      id,
      project_id: projectId,
      boq_item_id: data.boq_item_id,
      number,
      location: data.location,
      zone: data.zone ?? null,
      floor: data.floor ?? null,
      description: data.description ?? null,
      submitted_qty: data.submitted_qty,
      unit: item.unit,
      engineer_id: ctx.actor.id,
      status: "draft",
      revision: 0,
    });
    if (data.file_ids.length) {
      await db.insert(entityFiles).values(
        data.file_ids.map((fid) => ({
          entity_type: "wir",
          entity_id: id,
          file_id: fid,
          label: "photo",
        })),
      );
    }
    await addEvent(ctxTx, id, "draft", null, null, {
      submitted_qty: data.submitted_qty,
    });
    await audit(ctxTx, {
      action: "created",
      entityType: "wir",
      entityId: id,
      projectId,
      after: { number, boq_item: item.code, submitted_qty: data.submitted_qty },
    });
    return { id, number };
  });
  return result;
}

function nextWirNumberSeq(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const m = /^WIR-(\d+)$/.exec(n);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `WIR-${String(max + 1).padStart(3, "0")}`;
}

export async function updateWirDraft(
  ctx: Ctx,
  projectId: string,
  wirId: string,
  input: z.infer<typeof updateWirSchema>,
) {
  await requireProjectPermission(ctx.actor, projectId, "wir:create");
  const data = updateWirSchema.parse(input);
  const [row] = await ctx.db
    .select()
    .from(wir)
    .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
    .limit(1);
  if (!row) notFound("WIR");
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError("INVALID_STATE", "Only drafts and returned WIRs can be edited", {
      i18nKey: "errors.invalidTransition",
    });
  }
  const isCreator = row.engineer_id === ctx.actor.id;
  if (!isCreator && !hasPermission(ctx.actor.role, "wir:approve")) {
    throw new AppError("FORBIDDEN", "Only the author can edit this WIR", { i18nKey: "errors.forbidden" });
  }
  if (data.submitted_qty && !d(data.submitted_qty).greaterThan(0)) {
    validation("Quantity must be greater than zero", { i18nKey: "errors.qtyPositive" });
  }
  const updated_qty = data.submitted_qty ?? row.submitted_qty;
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    await tx
      .update(wir)
      .set({
        location: data.location,
        zone: data.zone,
        floor: data.floor,
        description: data.description,
        submitted_qty: updated_qty,
        updated_at: new Date().toISOString(),
      })
      .where(eq(wir.id, wirId));
    await addEvent(ctxTx, wirId, row.status, row.status, "Draft updated", {
      submitted_qty: updated_qty,
    });
    await audit(ctxTx, {
      action: "updated",
      entityType: "wir",
      entityId: wirId,
      projectId,
      before: { submitted_qty: row.submitted_qty, location: row.location },
      after: { ...data, submitted_qty: updated_qty },
    });
  });
}

export async function submitWir(ctx: Ctx, projectId: string, wirId: string, comment?: string | null) {
  await requireProjectPermission(ctx.actor, projectId, "wir:create");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [row] = await tx
      .select()
      .from(wir)
      .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!row) notFound("WIR");
    if (row.status !== "draft" && row.status !== "returned") {
      throw new AppError("INVALID_STATE", "WIR is not in an editable state", {
        i18nKey: "errors.invalidTransition",
      });
    }
    const isCreator = row.engineer_id === ctx.actor.id;
    if (!isCreator && !hasPermission(ctx.actor.role, "wir:approve")) {
      throw new AppError("FORBIDDEN", "Only the author can submit this WIR", { i18nKey: "errors.forbidden" });
    }
    await assertWithinContract(ctxTx, row.boq_item_id, row.submitted_qty, row.id, "submit");
    const now = new Date().toISOString();
    await tx
      .update(wir)
      .set({
        status: "submitted",
        submitted_at: now,
        revision: row.status === "returned" ? row.revision + 1 : row.revision,
        review_comment: null,
        reviewer_id: null,
        reviewed_at: null,
        approved_qty: null,
        updated_at: now,
      })
      .where(eq(wir.id, wirId));
    await addEvent(ctxTx, wirId, "submitted", row.status, comment ?? null, {
      submitted_qty: row.submitted_qty,
    });
    await audit(ctxTx, {
      action: "submitted",
      entityType: "wir",
      entityId: wirId,
      projectId,
      before: { status: row.status },
      after: { status: "submitted" },
    });
  });
}

export async function startWirReview(ctx: Ctx, projectId: string, wirId: string, comment?: string | null) {
  await requireProjectPermission(ctx.actor, projectId, "wir:review");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [row] = await tx
      .select()
      .from(wir)
      .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!row) notFound("WIR");
    if (!canTransition(row.status, "under_review")) {
      throw new AppError("INVALID_STATE", "WIR cannot move to review from its current state", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await tx
      .update(wir)
      .set({ status: "under_review", reviewer_id: ctx.actor.id, updated_at: new Date().toISOString() })
      .where(eq(wir.id, wirId));
    await addEvent(ctxTx, wirId, "under_review", row.status, comment ?? null);
    await audit(ctxTx, {
      action: "updated",
      entityType: "wir",
      entityId: wirId,
      projectId,
      before: { status: row.status },
      after: { status: "under_review" },
    });
  });
}

const decideWirSchema = z.object({
  decision: z.enum(["approved", "approved_with_comments", "returned", "rejected"]),
  comment: z.string().max(4000).optional().nullable(),
  approved_qty: z.string().regex(/^\d+(\.\d{1,4})?$/).optional().nullable(),
});

export async function decideWir(ctx: Ctx, projectId: string, wirId: string, input: z.infer<typeof decideWirSchema>) {
  await requireProjectPermission(ctx.actor, projectId, "wir:approve");
  const data = decideWirSchema.parse(input);
  if (["approved_with_comments", "returned", "rejected"].includes(data.decision) && !data.comment?.trim()) {
    validation("A comment is required for this decision", { i18nKey: "errors.validation" });
  }

  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [row] = await tx
      .select()
      .from(wir)
      .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!row) notFound("WIR");
    if (!canTransition(row.status, data.decision)) {
      throw new AppError("INVALID_STATE", `Cannot move WIR from ${row.status} to ${data.decision}`, {
        i18nKey: "errors.invalidTransition",
      });
    }
    const isSuperAdmin = ctx.actor.role === "super_admin";
    if (row.engineer_id === ctx.actor.id && !isSuperAdmin) {
      throw new AppError(
        "SEPARATION_OF_DUTIES",
        "You cannot review a WIR you submitted. A different reviewer is required.",
        { i18nKey: "errors.selfApproval" },
      );
    }

    let approvedQty: string | null = null;
    if (data.decision === "approved" || data.decision === "approved_with_comments") {
      approvedQty = data.approved_qty && data.approved_qty.trim() !== "" ? data.approved_qty : row.submitted_qty;
      if (!d(approvedQty).greaterThan(0)) {
        validation("Approved quantity must be greater than zero", { i18nKey: "errors.qtyPositive" });
      }
      if (d(approvedQty).greaterThan(d(row.submitted_qty))) {
        throw new AppError(
          "QUANTITY_EXCEEDED",
          "Approved quantity cannot exceed the submitted quantity",
          {
            i18nKey: "errors.qtyExceedsSubmitted",
            params: { submitted: row.submitted_qty, unit: row.unit },
          },
        );
      }
      await assertWithinContract(ctxTx, row.boq_item_id, approvedQty, row.id, "approve");
    }

    const now = new Date().toISOString();
    await tx
      .update(wir)
      .set({
        status: data.decision,
        approved_qty: approvedQty,
        reviewer_id: ctx.actor.id,
        reviewed_at: now,
        review_comment: data.comment ?? null,
        updated_at: now,
      })
      .where(eq(wir.id, wirId));
    await addEvent(ctxTx, wirId, data.decision, row.status, data.comment ?? null, {
      submitted_qty: row.submitted_qty,
      approved_qty: approvedQty,
    });
    await audit(ctxTx, {
      action: data.decision === "returned" ? "returned" : data.decision === "rejected" ? "rejected" : "approved",
      entityType: "wir",
      entityId: wirId,
      projectId,
      before: { status: row.status },
      after: { status: data.decision, approved_qty: approvedQty, comment: data.comment ?? null },
    });
  });
}

export async function attachWirFiles(ctx: Ctx, wirId: string, fileIds: string[]) {
  if (!fileIds.length) return;
  const [row] = await ctx.db.select().from(wir).where(eq(wir.id, wirId)).limit(1);
  if (!row) notFound("WIR");
  if (["approved", "approved_with_comments", "rejected"].includes(row.status)) {
    throw new AppError("INVALID_STATE", "Cannot attach files to a processed WIR", {
      i18nKey: "errors.invalidTransition",
    });
  }
  const rows = fileIds.map((fid) => ({
    entity_type: "wir",
    entity_id: wirId,
    file_id: fid,
    label: "photo",
  }));
  await ctx.db.insert(entityFiles).values(rows);
  await audit(ctx, {
    action: "updated",
    entityType: "wir",
    entityId: wirId,
    projectId: row.project_id,
    after: { attached_files: fileIds.length },
  });
}

export async function removeWirFile(ctx: Ctx, projectId: string, wirId: string, fileId: string) {
  await requireProjectPermission(ctx.actor, projectId, "wir:create");
  const [row] = await ctx.db
    .select()
    .from(wir)
    .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
    .limit(1);
  if (!row) notFound("WIR");
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError("INVALID_STATE", "Files can only be removed while the WIR is editable", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db
    .delete(entityFiles)
    .where(
      and(
        eq(entityFiles.entity_type, "wir"),
        eq(entityFiles.entity_id, wirId),
        eq(entityFiles.file_id, fileId),
      ),
    );
}

export async function deleteWirDraft(ctx: Ctx, projectId: string, wirId: string) {
  await requireProjectPermission(ctx.actor, projectId, "wir:create");
  const [row] = await ctx.db
    .select()
    .from(wir)
    .where(and(eq(wir.id, wirId), eq(wir.project_id, projectId)))
    .limit(1);
  if (!row) notFound("WIR");
  if (row.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only drafts can be deleted", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    await tx.delete(entityFiles).where(and(eq(entityFiles.entity_type, "wir"), eq(entityFiles.entity_id, wirId)));
    await tx.delete(wirEvents).where(eq(wirEvents.wir_id, wirId));
    await tx.delete(wir).where(eq(wir.id, wirId));
    await audit(ctxTx, {
      action: "deleted",
      entityType: "wir",
      entityId: wirId,
      projectId,
      before: { number: row.number },
    });
  });
}

export async function findWirProject(ctx: Ctx, wirId: string): Promise<string> {
  const [row] = await ctx.db
    .select({ project_id: wir.project_id })
    .from(wir)
    .where(eq(wir.id, wirId))
    .limit(1);
  if (!row) notFound("WIR");
  return row.project_id;
}

export async function pendingWirs(ctx: Ctx, projectId: string) {
  return ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(wir)
    .where(and(eq(wir.project_id, projectId), eq(wir.status, "submitted")))
    .then((r) => r[0]?.n ?? 0);
}
