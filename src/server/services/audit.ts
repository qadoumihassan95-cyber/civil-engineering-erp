import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, projects, projectMembers } from "@/db/schema";
import type { Ctx } from "./ctx";
import { requirePermission, isGlobalProjectRole } from "@/server/auth/context";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function audit(ctx: Ctx, input: AuditInput): Promise<void> {
  await ctx.db.insert(auditLogs).values({
    actor_id: ctx.actor.id,
    actor_name: ctx.actor.name,
    actor_role: ctx.actor.role,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    project_id: input.projectId ?? null,
    before: input.before === undefined ? null : (input.before as never),
    after: input.after === undefined ? null : (input.after as never),
  });
}

export interface AuditQuery {
  projectId?: string;
  entityType?: string;
  action?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAudit(ctx: Ctx, q: AuditQuery) {
  requirePermission(ctx.actor, "audit:view");
  const page = q.page ?? 1;
  const pageSize = Math.min(q.pageSize ?? 50, 200);
  const conds = [];
  if (q.projectId) conds.push(eq(auditLogs.project_id, q.projectId));
  if (q.entityType) conds.push(eq(auditLogs.entity_type, q.entityType));
  if (q.action) conds.push(eq(auditLogs.action, q.action));
  if (q.actorId) conds.push(eq(auditLogs.actor_id, q.actorId));
  if (!isGlobalProjectRole(ctx.actor.role)) {
    const membership = await ctx.db
      .select({ project_id: projectMembers.project_id })
      .from(projectMembers)
      .where(eq(projectMembers.user_id, ctx.actor.id));
    const ids = membership.map((r) => r.project_id);
    conds.push(ids.length ? inArray(auditLogs.project_id, ids) : sql`false`);
  }

  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    ctx.db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function recentProjectActivity(
  ctx: Ctx,
  projectId: string,
  limit = 12,
) {
  return ctx.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.project_id, projectId))
    .orderBy(desc(auditLogs.created_at))
    .limit(limit);
}

export async function projectIdsWithAudit(ctx: Ctx, projectIds: string[]) {
  return ctx.db
    .select({ project_id: projects.id })
    .from(projects)
    .where(sql`${projects.id} = any(${projectIds}::uuid[])`);
}
