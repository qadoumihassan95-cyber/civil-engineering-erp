import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { boqSections, boqItems, wir } from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requireProjectPermission, requireProjectAccess } from "@/server/auth/context";
import { d, mulMoney, sub, isNeg } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";

export const createSectionSchema = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(250),
  sort: z.number().int().optional(),
});

export const createItemSchema = z.object({
  section_id: z.string().uuid().optional().nullable(),
  code: z.string().min(1).max(40),
  description: z.string().min(1),
  unit: z.string().min(1).max(30),
  contract_qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit_rate: z.string().regex(/^\d+(\.\d{1,3})?$/),
  sort: z.number().int().optional(),
});

export const updateItemSchema = createItemSchema.partial().omit({ code: true });

export const variationSchema = z.object({
  contract_qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  note: z.string().max(1000).optional(),
});

export async function listSections(ctx: Ctx, projectId: string) {
  await requireProjectAccess(ctx.actor, projectId);
  return ctx.db
    .select()
    .from(boqSections)
    .where(eq(boqSections.project_id, projectId))
    .orderBy(asc(boqSections.sort), asc(boqSections.code));
}

interface ItemWithQty {
  id: string;
  project_id: string;
  section_id: string | null;
  code: string;
  description: string;
  unit: string;
  contract_qty: string;
  unit_rate: string;
  contract_amount: string;
  executed_qty: string;
  certified_qty: string | null;
  sort: number;
  is_active: boolean;
  submitted_qty: string;
  approved_qty: string;
  remaining_qty: string;
  progress: string;
  exceeds_contract: boolean;
}

export async function listItemsWithQuantities(ctx: Ctx, projectId: string): Promise<ItemWithQty[]> {
  await requireProjectAccess(ctx.actor, projectId);
  const items = await ctx.db
    .select()
    .from(boqItems)
    .where(and(eq(boqItems.project_id, projectId)))
    .orderBy(asc(boqItems.sort), asc(boqItems.code));

  const wirRows = await ctx.db
    .select({
      item: wir.boq_item_id,
      status: wir.status,
      submitted: wir.submitted_qty,
      approved: sql<string>`coalesce(${wir.approved_qty}, '0')`,
    })
    .from(wir)
    .where(eq(wir.project_id, projectId));

  const agg = new Map<string, { submitted: number; approved: number }>();
  for (const r of wirRows) {
    const a = agg.get(r.item) ?? { submitted: 0, approved: 0 };
    if (r.status === "submitted" || r.status === "under_review") {
      a.submitted += parseFloat(r.submitted) || 0;
    }
    if (r.status === "approved" || r.status === "approved_with_comments") {
      a.approved += parseFloat(r.approved) || 0;
    }
    agg.set(r.item, a);
  }

  return items.map((it) => {
    const a = agg.get(it.id) ?? { submitted: 0, approved: 0 };
    const remaining = d(it.contract_qty).minus(a.approved);
    const progress = d(it.contract_qty).isZero()
      ? "0"
      : d(a.approved).div(d(it.contract_qty)).times(100).toDecimalPlaces(2).toString();
    return {
      ...it,
      submitted_qty: String(a.submitted),
      approved_qty: String(a.approved),
      remaining_qty: remaining.toFixed(4),
      progress,
      exceeds_contract: a.submitted > parseFloat(it.contract_qty) || a.approved > parseFloat(it.contract_qty),
    };
  });
}

export async function createSection(ctx: Ctx, projectId: string, input: z.infer<typeof createSectionSchema>) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const data = createSectionSchema.parse(input);
  const id = newId();
  const maxSort = await ctx.db
    .select({ m: sql<number>`coalesce(max(${boqSections.sort}), 0)` })
    .from(boqSections)
    .where(eq(boqSections.project_id, projectId));
  await ctx.db.transaction(async (tx) => {
    await tx.insert(boqSections).values({
      id,
      project_id: projectId,
      code: data.code,
      title: data.title,
      sort: data.sort ?? (maxSort[0]?.m ?? 0) + 1,
    });
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "created",
      entityType: "boq_section",
      entityId: id,
      projectId,
      after: data,
    });
  });
  return { id };
}

export async function updateSection(
  ctx: Ctx,
  projectId: string,
  sectionId: string,
  input: z.infer<typeof createSectionSchema>,
) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const data = createSectionSchema.parse(input);
  const [s] = await ctx.db.select().from(boqSections).where(eq(boqSections.id, sectionId)).limit(1);
  if (!s || s.project_id !== projectId) notFound("Section");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(boqSections)
      .set({ code: data.code, title: data.title, sort: data.sort, updated_at: new Date().toISOString() })
      .where(eq(boqSections.id, sectionId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "boq_section",
      entityId: sectionId,
      projectId,
      before: { code: s.code, title: s.title },
      after: { code: data.code, title: data.title },
    });
  });
}

export async function deleteSection(ctx: Ctx, projectId: string, sectionId: string) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const [s] = await ctx.db.select().from(boqSections).where(eq(boqSections.id, sectionId)).limit(1);
  if (!s || s.project_id !== projectId) notFound("Section");
  const items = await ctx.db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(eq(boqItems.section_id, sectionId))
    .limit(1);
  if (items.length) {
    throw new AppError("INVALID_STATE", "Section contains items; move or delete them first", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(boqSections).where(eq(boqSections.id, sectionId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "boq_section",
      entityId: sectionId,
      projectId,
      before: { code: s.code, title: s.title },
    });
  });
}

export async function createItem(ctx: Ctx, projectId: string, input: z.infer<typeof createItemSchema>) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const data = createItemSchema.parse(input);
  const id = newId();
  const contractAmount = mulMoney(data.contract_qty, data.unit_rate);
  const maxSort = await ctx.db
    .select({ m: sql<number>`coalesce(max(${boqItems.sort}), 0)` })
    .from(boqItems)
    .where(eq(boqItems.project_id, projectId));
  await ctx.db.transaction(async (tx) => {
    await tx.insert(boqItems).values({
      id,
      project_id: projectId,
      section_id: data.section_id ?? null,
      code: data.code,
      description: data.description,
      unit: data.unit,
      contract_qty: data.contract_qty,
      unit_rate: data.unit_rate,
      contract_amount: contractAmount,
      sort: data.sort ?? (maxSort[0]?.m ?? 0) + 1,
    });
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "created",
      entityType: "boq_item",
      entityId: id,
      projectId,
      after: { ...data, contract_amount: contractAmount },
    });
  });
  return { id };
}

export async function updateItem(
  ctx: Ctx,
  projectId: string,
  itemId: string,
  input: z.infer<typeof updateItemSchema>,
) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const data = updateItemSchema.parse(input);
  const [it] = await ctx.db.select().from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
  if (!it || it.project_id !== projectId) notFound("BOQ item");

  const contract_qty = data.contract_qty ?? it.contract_qty;
  const approved = await approvedQtyForItem(ctx, itemId);
  if (isNeg(sub(contract_qty, approved))) {
    throw new AppError(
      "QUANTITY_EXCEEDED",
      `Contract quantity cannot be less than already approved quantity (${approved})`,
      { i18nKey: "errors.quantityExceedsRemaining", params: { remaining: approved, unit: it.unit } },
    );
  }

  const unit_rate = data.unit_rate ?? it.unit_rate;
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(boqItems)
      .set({
        section_id: data.section_id,
        description: data.description,
        unit: data.unit,
        contract_qty,
        unit_rate,
        contract_amount: mulMoney(contract_qty, unit_rate),
        sort: data.sort,
        updated_at: new Date().toISOString(),
      })
      .where(eq(boqItems.id, itemId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "boq_item",
      entityId: itemId,
      projectId,
      before: { contract_qty: it.contract_qty, unit_rate: it.unit_rate },
      after: { ...data, contract_amount: mulMoney(contract_qty, unit_rate) },
    });
  });
}

export async function applyVariation(
  ctx: Ctx,
  projectId: string,
  itemId: string,
  input: z.infer<typeof variationSchema>,
) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const data = variationSchema.parse(input);
  const [it] = await ctx.db.select().from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
  if (!it || it.project_id !== projectId) notFound("BOQ item");
  const approved = await approvedQtyForItem(ctx, itemId);
  if (isNeg(sub(data.contract_qty, approved))) {
    throw new AppError(
      "QUANTITY_EXCEEDED",
      `Contract quantity cannot be less than already approved quantity (${approved})`,
      { i18nKey: "errors.quantityExceedsRemaining", params: { remaining: approved, unit: it.unit } },
    );
  }
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(boqItems)
      .set({
        contract_qty: data.contract_qty,
        contract_amount: mulMoney(data.contract_qty, it.unit_rate),
        updated_at: new Date().toISOString(),
      })
      .where(eq(boqItems.id, itemId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "boq_item",
      entityId: itemId,
      projectId,
      before: { contract_qty: it.contract_qty, contract_amount: it.contract_amount },
      after: {
        contract_qty: data.contract_qty,
        contract_amount: mulMoney(data.contract_qty, it.unit_rate),
        note: data.note,
      },
    });
  });
}

export async function setCertifiedQty(
  ctx: Ctx,
  projectId: string,
  itemId: string,
  certifiedQty: string,
) {
  await requireProjectPermission(ctx.actor, projectId, "boq:certify");
  if (!/^\d+(\.\d{1,4})?$/.test(certifiedQty)) validation("Invalid quantity");
  const [it] = await ctx.db.select().from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
  if (!it || it.project_id !== projectId) notFound("BOQ item");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(boqItems)
      .set({ certified_qty: certifiedQty, updated_at: new Date().toISOString() })
      .where(eq(boqItems.id, itemId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "boq_item",
      entityId: itemId,
      projectId,
      before: { certified_qty: it.certified_qty },
      after: { certified_qty: certifiedQty },
    });
  });
}

export async function deleteItem(ctx: Ctx, projectId: string, itemId: string) {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const [it] = await ctx.db.select().from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
  if (!it || it.project_id !== projectId) notFound("BOQ item");
  const linked = await ctx.db
    .select({ id: wir.id })
    .from(wir)
    .where(eq(wir.boq_item_id, itemId))
    .limit(1);
  if (linked.length) {
    throw new AppError("INVALID_STATE", "BOQ item has WIRs; it cannot be deleted", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(boqItems).where(eq(boqItems.id, itemId));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "boq_item",
      entityId: itemId,
      projectId,
      before: { code: it.code, description: it.description },
    });
  });
}

export async function approvedQtyForItem(ctx: Ctx, itemId: string): Promise<string> {
  const rows = await ctx.db
    .select({ q: sql<string>`coalesce(sum(${wir.approved_qty}), '0')` })
    .from(wir)
    .where(
      and(eq(wir.boq_item_id, itemId), sql`${wir.status} in ('approved','approved_with_comments')`),
    );
  return rows[0]?.q ?? "0";
}
