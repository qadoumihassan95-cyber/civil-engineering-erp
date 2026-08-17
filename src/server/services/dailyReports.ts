import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  dailyReports,
  drManpower,
  drSubcontractors,
  drEquipment,
  drActivities,
  drMaterialReceived,
  drMaterialConsumed,
  drDelays,
  drIncidents,
  drSafety,
  drVisitors,
  drEvents,
  entityFiles,
  files,
  projects,
  boqItems,
  type DrStatus,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requireProjectPermission, requireProjectAccess } from "@/server/auth/context";
import { d } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";

const weatherSchema = z.object({
  condition: z.string().max(60).optional(),
  temp_min: z.number().min(-50).max(80).optional().nullable(),
  temp_max: z.number().min(-50).max(80).optional().nullable(),
  wind: z.string().max(60).optional(),
});

const manpowerSchema = z.object({ labor_type: z.string().min(1).max(120), count: z.number().int().min(0).max(100000) });
const subSchema = z.object({ name: z.string().min(1).max(200), crew_count: z.number().int().min(0).nullable().optional(), work_done: z.string().max(2000).optional() });
const equipSchema = z.object({ name: z.string().min(1).max(150), hours: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(), notes: z.string().max(1000).optional() });
const activitySchema = z.object({
  boq_item_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(2000),
  qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit: z.string().max(30).optional(),
  location: z.string().max(250).optional(),
});
const matRecvSchema = z.object({
  material_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(150),
  qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit: z.string().max(30).optional(),
  supplier: z.string().max(200).optional(),
});
const matConsSchema = z.object({
  material_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(150),
  qty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit: z.string().max(30).optional(),
  source: z.string().max(150).optional(),
});
const delaySchema = z.object({
  description: z.string().min(1).max(2000),
  duration_hours: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  party: z.string().max(150).optional(),
});
const incidentSchema = z.object({
  description: z.string().min(1).max(2000),
  severity: z.string().max(30).optional(),
  action_taken: z.string().max(2000).optional(),
});
const safetySchema = z.object({ observation: z.string().min(1).max(2000), action: z.string().max(2000).optional() });
const visitorSchema = z.object({ name: z.string().min(1).max(150), organization: z.string().max(200).optional(), purpose: z.string().max(1000).optional() });

export const dailyReportSchema = z.object({
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weather: weatherSchema.default({}),
  site_conditions: z.string().max(4000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  manpower: z.array(manpowerSchema).default([]),
  subcontractors: z.array(subSchema).default([]),
  equipment: z.array(equipSchema).default([]),
  activities: z.array(activitySchema).default([]),
  materials_received: z.array(matRecvSchema).default([]),
  materials_consumed: z.array(matConsSchema).default([]),
  delays: z.array(delaySchema).default([]),
  incidents: z.array(incidentSchema).default([]),
  safety: z.array(safetySchema).default([]),
  visitors: z.array(visitorSchema).default([]),
  file_ids: z.array(z.string().uuid()).default([]),
});

export type DailyReportInput = z.infer<typeof dailyReportSchema>;

async function projectPolicy(ctx: Ctx, projectId: string): Promise<"manager" | "none"> {
  const [p] = await ctx.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const settings = (p?.settings ?? {}) as { dailyReportApproval?: string };
  return settings.dailyReportApproval === "none" ? "none" : "manager";
}

export async function listDailyReports(ctx: Ctx, projectId: string, opts: { status?: string; from?: string; to?: string } = {}) {
  await requireProjectAccess(ctx.actor, projectId);
  const conds = [eq(dailyReports.project_id, projectId)];
  if (opts.status) conds.push(eq(dailyReports.status, opts.status as DrStatus));
  if (opts.from) conds.push(sql`${dailyReports.report_date} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${dailyReports.report_date} <= ${opts.to}`);
  return ctx.db
    .select({
      id: dailyReports.id,
      report_date: dailyReports.report_date,
      status: dailyReports.status,
      submitted_at: dailyReports.submitted_at,
      reviewed_at: dailyReports.reviewed_at,
      created_at: dailyReports.created_at,
      weather: dailyReports.weather,
      submitter_name: sql<string | null>`(select name from users u where u.id = ${dailyReports.submitted_by})`,
      reviewer_name: sql<string | null>`(select name from users u where u.id = ${dailyReports.reviewed_by})`,
      activity_count: sql<number>`(select count(*)::int from dr_activities a where a.report_id = ${dailyReports.id})`,
      manpower_count: sql<number>`(select coalesce(sum(count),0)::int from dr_manpower m where m.report_id = ${dailyReports.id})`,
    })
    .from(dailyReports)
    .where(and(...conds))
    .orderBy(desc(dailyReports.report_date));
}

export async function getDailyReport(ctx: Ctx, projectId: string, reportId: string) {
  await requireProjectAccess(ctx.actor, projectId);
  const [report] = await ctx.db
    .select({
      id: dailyReports.id,
      project_id: dailyReports.project_id,
      report_date: dailyReports.report_date,
      weather: dailyReports.weather,
      site_conditions: dailyReports.site_conditions,
      notes: dailyReports.notes,
      status: dailyReports.status,
      submitted_by: dailyReports.submitted_by,
      submitted_at: dailyReports.submitted_at,
      reviewed_by: dailyReports.reviewed_by,
      reviewed_at: dailyReports.reviewed_at,
      review_comment: dailyReports.review_comment,
      created_at: dailyReports.created_at,
      updated_at: dailyReports.updated_at,
      submitter_name: sql<string | null>`(select name from users u where u.id = ${dailyReports.submitted_by})`,
      reviewer_name: sql<string | null>`(select name from users u where u.id = ${dailyReports.reviewed_by})`,
      project_code: sql<string>`(select code from projects p where p.id = ${dailyReports.project_id})`,
      project_name: sql<string>`(select name from projects p where p.id = ${dailyReports.project_id})`,
    })
    .from(dailyReports)
    .where(and(eq(dailyReports.id, reportId), eq(dailyReports.project_id, projectId)))
    .limit(1);
  if (!report) notFound("Daily report");

  const [
    manpower,
    subcontractors,
    equipment,
    activities,
    materials_received,
    materials_consumed,
    delays,
    incidents,
    safety,
    visitors,
    events,
    attachments,
  ] = await Promise.all([
    ctx.db.select().from(drManpower).where(eq(drManpower.report_id, reportId)),
    ctx.db.select().from(drSubcontractors).where(eq(drSubcontractors.report_id, reportId)),
    ctx.db.select().from(drEquipment).where(eq(drEquipment.report_id, reportId)),
    ctx.db
      .select({
        id: drActivities.id,
        boq_item_id: drActivities.boq_item_id,
        description: drActivities.description,
        qty: drActivities.qty,
        unit: drActivities.unit,
        location: drActivities.location,
        applied_qty: drActivities.applied_qty,
        item_code: sql<string | null>`(select code from boq_items bi where bi.id = ${drActivities.boq_item_id})`,
      })
      .from(drActivities)
      .where(eq(drActivities.report_id, reportId))
      .orderBy(asc(drActivities.id)),
    ctx.db.select().from(drMaterialReceived).where(eq(drMaterialReceived.report_id, reportId)),
    ctx.db.select().from(drMaterialConsumed).where(eq(drMaterialConsumed.report_id, reportId)),
    ctx.db.select().from(drDelays).where(eq(drDelays.report_id, reportId)),
    ctx.db.select().from(drIncidents).where(eq(drIncidents.report_id, reportId)),
    ctx.db.select().from(drSafety).where(eq(drSafety.report_id, reportId)),
    ctx.db.select().from(drVisitors).where(eq(drVisitors.report_id, reportId)),
    ctx.db
      .select()
      .from(drEvents)
      .where(eq(drEvents.report_id, reportId))
      .orderBy(asc(drEvents.created_at)),
    ctx.db
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        created_at: entityFiles.created_at,
      })
      .from(entityFiles)
      .innerJoin(files, eq(files.id, entityFiles.file_id))
      .where(and(eq(entityFiles.entity_type, "daily_report"), eq(entityFiles.entity_id, reportId))),
  ]);

  return {
    ...report,
    manpower,
    subcontractors,
    equipment,
    activities,
    materials_received,
    materials_consumed,
    delays,
    incidents,
    safety,
    visitors,
    events,
    attachments,
  };
}

function childRows(reportId: string, data: DailyReportInput) {
  return {
    manpower: data.manpower.map((m) => ({ report_id: reportId, labor_type: m.labor_type, count: m.count })),
    subcontractors: data.subcontractors.map((s) => ({
      report_id: reportId,
      name: s.name,
      crew_count: s.crew_count ?? null,
      work_done: s.work_done ?? null,
    })),
    equipment: data.equipment.map((e) => ({ report_id: reportId, name: e.name, hours: e.hours ?? null, notes: e.notes ?? null })),
    activities: data.activities.map((a) => ({
      report_id: reportId,
      boq_item_id: a.boq_item_id ?? null,
      description: a.description,
      qty: a.qty,
      unit: a.unit ?? null,
      location: a.location ?? null,
    })),
    materials_received: data.materials_received.map((m) => ({
      report_id: reportId,
      material_id: m.material_id ?? null,
      name: m.name,
      qty: m.qty,
      unit: m.unit ?? null,
      supplier: m.supplier ?? null,
    })),
    materials_consumed: data.materials_consumed.map((m) => ({
      report_id: reportId,
      material_id: m.material_id ?? null,
      name: m.name,
      qty: m.qty,
      unit: m.unit ?? null,
      source: m.source ?? null,
    })),
    delays: data.delays.map((dl) => ({
      report_id: reportId,
      description: dl.description,
      duration_hours: dl.duration_hours ?? null,
      party: dl.party ?? null,
    })),
    incidents: data.incidents.map((i) => ({
      report_id: reportId,
      description: i.description,
      severity: i.severity ?? null,
      action_taken: i.action_taken ?? null,
    })),
    safety: data.safety.map((s) => ({ report_id: reportId, observation: s.observation, action: s.action ?? null })),
    visitors: data.visitors.map((v) => ({
      report_id: reportId,
      name: v.name,
      organization: v.organization ?? null,
      purpose: v.purpose ?? null,
    })),
  };
}

async function insertChildren(db: Ctx["db"], reportId: string, data: DailyReportInput) {
  const rows = childRows(reportId, data);
  if (rows.manpower.length) await db.insert(drManpower).values(rows.manpower);
  if (rows.subcontractors.length) await db.insert(drSubcontractors).values(rows.subcontractors);
  if (rows.equipment.length) await db.insert(drEquipment).values(rows.equipment);
  if (rows.activities.length) await db.insert(drActivities).values(rows.activities);
  if (rows.materials_received.length) await db.insert(drMaterialReceived).values(rows.materials_received);
  if (rows.materials_consumed.length) await db.insert(drMaterialConsumed).values(rows.materials_consumed);
  if (rows.delays.length) await db.insert(drDelays).values(rows.delays);
  if (rows.incidents.length) await db.insert(drIncidents).values(rows.incidents);
  if (rows.safety.length) await db.insert(drSafety).values(rows.safety);
  if (rows.visitors.length) await db.insert(drVisitors).values(rows.visitors);
}

async function deleteChildren(db: Ctx["db"], reportId: string) {
  await db.delete(drManpower).where(eq(drManpower.report_id, reportId));
  await db.delete(drSubcontractors).where(eq(drSubcontractors.report_id, reportId));
  await db.delete(drEquipment).where(eq(drEquipment.report_id, reportId));
  await db.delete(drActivities).where(eq(drActivities.report_id, reportId));
  await db.delete(drMaterialReceived).where(eq(drMaterialReceived.report_id, reportId));
  await db.delete(drMaterialConsumed).where(eq(drMaterialConsumed.report_id, reportId));
  await db.delete(drDelays).where(eq(drDelays.report_id, reportId));
  await db.delete(drIncidents).where(eq(drIncidents.report_id, reportId));
  await db.delete(drSafety).where(eq(drSafety.report_id, reportId));
  await db.delete(drVisitors).where(eq(drVisitors.report_id, reportId));
}

async function assertBoqActivitiesInProject(db: Ctx["db"], projectId: string, data: DailyReportInput) {
  const itemIds = data.activities.map((a) => a.boq_item_id).filter(Boolean) as string[];
  if (!itemIds.length) return;
  const rows = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(and(inArray(boqItems.id, itemIds), eq(boqItems.project_id, projectId)));
  const found = new Set(rows.map((r) => r.id));
  for (const id of itemIds) {
    if (!found.has(id)) {
      throw new AppError("VALIDATION", "A linked BOQ item does not belong to this project", {
        i18nKey: "errors.boqItemMismatch",
      });
    }
  }
}

export async function createDailyReport(ctx: Ctx, projectId: string, input: DailyReportInput) {
  await requireProjectPermission(ctx.actor, projectId, "dr:create");
  const data = dailyReportSchema.parse(input);
  const id = newId();
  await ctx.db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: dailyReports.id })
      .from(dailyReports)
      .where(and(eq(dailyReports.project_id, projectId), eq(dailyReports.report_date, data.report_date)))
      .limit(1);
    if (dup) {
      throw new AppError("CONFLICT", "A daily report already exists for this date", {
        i18nKey: "errors.duplicateDailyReport",
      });
    }
    await assertBoqActivitiesInProject(tx as never, projectId, data);
    const ctxTx = { ...ctx, db: tx as never };
    await tx.insert(dailyReports).values({
      id,
      project_id: projectId,
      report_date: data.report_date,
      weather: data.weather as never,
      site_conditions: data.site_conditions ?? null,
      notes: data.notes ?? null,
      status: "draft",
    });
    await insertChildren(tx as never, id, data);
    if (data.file_ids.length) {
      await tx.insert(entityFiles).values(
        data.file_ids.map((fid) => ({ entity_type: "daily_report", entity_id: id, file_id: fid, label: "photo" })),
      );
    }
    await tx.insert(drEvents).values({
      report_id: id,
      to_status: "draft",
      actor_id: ctx.actor.id,
      actor_name: ctx.actor.name,
    });
    await audit(ctxTx, {
      action: "created",
      entityType: "daily_report",
      entityId: id,
      projectId,
      after: { report_date: data.report_date },
    });
  });
  return { id };
}

export async function updateDailyReport(ctx: Ctx, projectId: string, reportId: string, input: DailyReportInput) {
  await requireProjectPermission(ctx.actor, projectId, "dr:create");
  const data = dailyReportSchema.parse(input);
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [report] = await tx
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.id, reportId), eq(dailyReports.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!report) notFound("Daily report");
    if (report.status !== "draft" && report.status !== "rejected") {
      throw new AppError("INVALID_STATE", "Only drafts and rejected reports can be edited", {
        i18nKey: "errors.invalidTransition",
      });
    }
    await assertBoqActivitiesInProject(tx as never, projectId, data);
    await tx
      .update(dailyReports)
      .set({
        report_date: data.report_date,
        weather: data.weather as never,
        site_conditions: data.site_conditions ?? null,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(dailyReports.id, reportId));
    await deleteChildren(tx as never, reportId);
    await insertChildren(tx as never, reportId, data);
    if (data.file_ids !== undefined) {
      await tx.delete(entityFiles).where(and(eq(entityFiles.entity_type, "daily_report"), eq(entityFiles.entity_id, reportId)));
      if (data.file_ids.length) {
        await tx.insert(entityFiles).values(
          data.file_ids.map((fid) => ({ entity_type: "daily_report", entity_id: reportId, file_id: fid, label: "photo" })),
        );
      }
    }
    await audit(ctxTx, {
      action: "updated",
      entityType: "daily_report",
      entityId: reportId,
      projectId,
      after: { report_date: data.report_date },
    });
  });
}

async function applyExecutedQuantities(db: Ctx["db"], reportId: string, sign: 1 | -1) {
  const rows = await db
    .select({ id: drActivities.id, boq_item_id: drActivities.boq_item_id, qty: drActivities.qty, applied_qty: drActivities.applied_qty })
    .from(drActivities)
    .where(eq(drActivities.report_id, reportId));
  for (const row of rows) {
    if (!row.boq_item_id) continue;
    const delta = d(row.qty).minus(row.applied_qty);
    if (delta.isZero() && sign === 1) continue;
    const apply = sign === 1 ? delta : d(row.applied_qty).negated();
    if (apply.isZero()) continue;
    const newApplied = sign === 1 ? row.qty : "0";
    await db.execute(sql`
      update boq_items
      set executed_qty = greatest(0, executed_qty + ${apply.toFixed(4)}::numeric),
          updated_at = now()
      where id = ${row.boq_item_id}
    `);
    await db
      .update(drActivities)
      .set({ applied_qty: newApplied })
      .where(eq(drActivities.id, row.id));
  }
}

export async function submitDailyReport(ctx: Ctx, projectId: string, reportId: string, comment?: string | null) {
  await requireProjectPermission(ctx.actor, projectId, "dr:create");
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [report] = await tx
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.id, reportId), eq(dailyReports.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!report) notFound("Daily report");
    if (report.status !== "draft" && report.status !== "rejected") {
      throw new AppError("INVALID_STATE", "Only drafts and rejected reports can be submitted", {
        i18nKey: "errors.invalidTransition",
      });
    }
    if (report.submitted_by && report.submitted_by !== ctx.actor.id && report.status === "rejected") {
      const isManager = await requireProjectPermission(ctx.actor, projectId, "dr:approve");
      if (!isManager) {
        throw new AppError("FORBIDDEN", "Only the original submitter may resubmit", {
          i18nKey: "errors.forbidden",
        });
      }
    }
    const now = new Date().toISOString();
    await tx
      .update(dailyReports)
      .set({
        status: "submitted",
        submitted_by: ctx.actor.id,
        submitted_at: now,
        review_comment: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      })
      .where(eq(dailyReports.id, reportId));
    await applyExecutedQuantities(tx as never, reportId, 1);
    await tx.insert(drEvents).values({
      report_id: reportId,
      from_status: report.status,
      to_status: "submitted",
      actor_id: ctx.actor.id,
      actor_name: ctx.actor.name,
      comment: comment ?? null,
    });
    await audit(ctxTx, {
      action: "submitted",
      entityType: "daily_report",
      entityId: reportId,
      projectId,
      before: { status: report.status },
      after: { status: "submitted" },
    });
  });
}

export async function decideDailyReport(
  ctx: Ctx,
  projectId: string,
  reportId: string,
  input: { decision: "approved" | "rejected"; comment?: string | null },
) {
  await requireProjectPermission(ctx.actor, projectId, "dr:approve");
  if (input.decision === "rejected" && !input.comment?.trim()) {
    validation("A comment is required when rejecting", { i18nKey: "errors.validation" });
  }
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [report] = await tx
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.id, reportId), eq(dailyReports.project_id, projectId)))
      .limit(1)
      .for("update");
    if (!report) notFound("Daily report");
    if (report.status !== "submitted") {
      throw new AppError("INVALID_STATE", "Only submitted reports can be reviewed", {
        i18nKey: "errors.invalidTransition",
      });
    }
    const policy = await projectPolicy(ctxTx, projectId);
    if (policy === "none") {
      throw new AppError("INVALID_STATE", "This project does not require report approval", {
        i18nKey: "errors.invalidTransition",
      });
    }
    if (report.submitted_by === ctx.actor.id && ctx.actor.role !== "super_admin") {
      throw new AppError(
        "SEPARATION_OF_DUTIES",
        "You cannot approve a report you submitted. A different reviewer is required.",
        { i18nKey: "errors.selfApproval" },
      );
    }
    const now = new Date().toISOString();
    await tx
      .update(dailyReports)
      .set({
        status: input.decision,
        reviewed_by: ctx.actor.id,
        reviewed_at: now,
        review_comment: input.comment ?? null,
        updated_at: now,
      })
      .where(eq(dailyReports.id, reportId));
    if (input.decision === "rejected") {
      await applyExecutedQuantities(tx as never, reportId, -1);
    }
    await tx.insert(drEvents).values({
      report_id: reportId,
      from_status: "submitted",
      to_status: input.decision,
      actor_id: ctx.actor.id,
      actor_name: ctx.actor.name,
      comment: input.comment ?? null,
    });
    await audit(ctxTx, {
      action: input.decision,
      entityType: "daily_report",
      entityId: reportId,
      projectId,
      before: { status: "submitted" },
      after: { status: input.decision },
    });
  });
}

export async function findReportProject(ctx: Ctx, reportId: string): Promise<string> {
  const [row] = await ctx.db
    .select({ project_id: dailyReports.project_id })
    .from(dailyReports)
    .where(eq(dailyReports.id, reportId))
    .limit(1);
  if (!row) notFound("Daily report");
  return row.project_id;
}

export async function deleteDailyReport(ctx: Ctx, projectId: string, reportId: string) {
  await requireProjectPermission(ctx.actor, projectId, "dr:create");
  const [report] = await ctx.db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.id, reportId), eq(dailyReports.project_id, projectId)))
    .limit(1);
  if (!report) notFound("Daily report");
  if (report.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only drafts can be deleted", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    await tx.delete(entityFiles).where(and(eq(entityFiles.entity_type, "daily_report"), eq(entityFiles.entity_id, reportId)));
    await tx.delete(dailyReports).where(eq(dailyReports.id, reportId));
    await audit(ctxTx, {
      action: "deleted",
      entityType: "daily_report",
      entityId: reportId,
      projectId,
      before: { report_date: report.report_date },
    });
  });
}
