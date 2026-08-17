import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { documents, files, entityFiles, wir, dailyReports, expenses, adjustments } from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requireProjectAccess, requireProjectPermission, hasProjectAccess, isGlobalProjectRole } from "@/server/auth/context";
import { newId } from "@/server/lib/ids";
import { storageProvider, sha256, MAX_FILE_SIZE, isAllowedMime, safeExtension, newStorageKey } from "@/server/storage";

export const documentSchema = z.object({
  project_id: z.string().uuid().optional().nullable(),
  kind: z.enum(["drawing", "document", "photo", "report"]),
  title: z.string().min(1).max(250),
  description: z.string().max(4000).optional().nullable(),
  discipline: z.string().max(60).optional().nullable(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  series_key: z.string().max(60).optional(),
});

export async function listDocuments(
  ctx: Ctx,
  opts: { projectId?: string; kind?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 30, 100);
  const conds = [eq(documents.status, "current")];

  if (opts.projectId) {
    conds.push(eq(documents.project_id, opts.projectId));
    await requireProjectAccess(ctx.actor, opts.projectId);
  } else if (!isGlobalProjectRole(ctx.actor.role)) {
    const membership = await ctx.db.execute(
      sql`select project_id from project_members where user_id = ${ctx.actor.id}`,
    );
    const ids = (membership as unknown as { project_id: string }[]).map((r) => r.project_id);
    const scopeCond = or(isNull(documents.project_id), inArray(documents.project_id, ids));
    if (scopeCond) conds.push(scopeCond);
  }

  if (opts.kind) conds.push(eq(documents.kind, opts.kind as never));
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(sql`(${documents.title} ilike ${s} or ${documents.series_key} ilike ${s})`);
  }
  const where = and(...conds);

  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: documents.id,
        project_id: documents.project_id,
        kind: documents.kind,
        title: documents.title,
        description: documents.description,
        discipline: documents.discipline,
        revision: documents.revision,
        series_key: documents.series_key,
        status: documents.status,
        issue_date: documents.issue_date,
        created_at: documents.created_at,
        file_id: documents.file_id,
        file_name: files.name,
        file_mime: files.mime,
        file_size: files.size,
        project_code: sql<string | null>`(select code from projects p where p.id = ${documents.project_id})`,
        uploader_name: sql<string | null>`(select name from users u where u.id = ${documents.uploaded_by})`,
      })
      .from(documents)
      .innerJoin(files, eq(files.id, documents.file_id))
      .where(where)
      .orderBy(desc(documents.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(documents)
      .where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, pageSize };
}

export async function listRevisions(ctx: Ctx, seriesKey: string, projectId: string | null) {
  if (projectId) {
    await requireProjectAccess(ctx.actor, projectId);
  } else if (!isGlobalProjectRole(ctx.actor.role)) {
    throw new AppError("FORBIDDEN", "You cannot view organization-level revisions", {
      i18nKey: "errors.forbidden",
    });
  }
  return ctx.db
    .select({
      id: documents.id,
      revision: documents.revision,
      status: documents.status,
      created_at: documents.created_at,
      issue_date: documents.issue_date,
      file_id: documents.file_id,
      file_name: files.name,
      file_size: files.size,
    })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.file_id))
    .where(
      and(
        eq(documents.series_key, seriesKey),
        projectId ? eq(documents.project_id, projectId) : sql`${documents.project_id} is null`,
      ),
    )
    .orderBy(asc(documents.revision));
}

function nextRevision(current: string): string {
  const last = current.trim().toUpperCase();
  if (!last) return "A";
  const ch = last.charCodeAt(last.length - 1);
  if (ch >= 65 && ch < 90) return last.slice(0, -1) + String.fromCharCode(ch + 1);
  return `${last}-1`;
}

export async function uploadDocument(
  ctx: Ctx,
  input: z.infer<typeof documentSchema>,
  file: { name: string; mime: string; data: Buffer },
) {
  const data = documentSchema.parse(input);
  const projectId = data.project_id ?? null;
  if (projectId) {
    await requireProjectPermission(ctx.actor, projectId, "document:upload");
  } else {
    const ok = ["super_admin", "owner", "general_manager"].includes(ctx.actor.role);
    if (!ok) {
      throw new AppError("FORBIDDEN", "You cannot upload organization documents", {
        i18nKey: "errors.forbidden",
      });
    }
  }
  if (file.data.length > MAX_FILE_SIZE) {
    validation("File is too large (max 20 MB)", { i18nKey: "errors.fileTooLarge" });
  }
  if (!isAllowedMime(file.mime)) {
    validation("This file type is not allowed", { i18nKey: "errors.unsupportedFileType" });
  }

  const ext = safeExtension(file.name);
  const provider = storageProvider();
  const key = newStorageKey(ext);
  await provider.save(key, file.data, file.mime);

  const id = newId();
  const seriesKey = data.series_key ?? id;
  await ctx.db.transaction(async (tx) => {
    const ctxTx = { ...ctx, db: tx as never };
    const [fileRow] = await tx
      .insert(files)
      .values({
        id: newId(),
        name: file.name,
        mime: file.mime,
        size: file.data.length,
        storage_provider: provider.name,
        storage_key: key,
        checksum: sha256(file.data),
        uploaded_by: ctx.actor.id,
      })
      .returning({ id: files.id });
    const existing = await tx
      .select({ revision: documents.revision, id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.series_key, seriesKey),
          projectId ? eq(documents.project_id, projectId) : sql`${documents.project_id} is null`,
        ),
      )
      .orderBy(desc(documents.created_at))
      .limit(1);
    let revision = "A";
    if (existing.length) {
      revision = nextRevision(existing[0].revision);
      await tx
        .update(documents)
        .set({ status: "superseded" })
        .where(
          and(
            eq(documents.series_key, seriesKey),
            projectId ? eq(documents.project_id, projectId) : sql`${documents.project_id} is null`,
            eq(documents.status, "current"),
          ),
        );
    }
    await tx.insert(documents).values({
      id,
      project_id: projectId,
      kind: data.kind,
      title: data.title,
      description: data.description ?? null,
      discipline: data.discipline ?? null,
      revision,
      series_key: seriesKey,
      status: "current",
      file_id: fileRow.id,
      uploaded_by: ctx.actor.id,
      issue_date: data.issue_date ?? null,
    });
    await audit(ctxTx, {
      action: "created",
      entityType: "document",
      entityId: id,
      projectId,
      after: { title: data.title, kind: data.kind, revision, series: seriesKey },
    });
  });
  return { id, seriesKey };
}

export async function deleteDocument(ctx: Ctx, id: string) {
  const [doc] = await ctx.db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) notFound("Document");
  if (doc.project_id) {
    await requireProjectPermission(ctx.actor, doc.project_id, "document:manage");
  } else {
    const ok = ["super_admin", "owner", "general_manager"].includes(ctx.actor.role);
    if (!ok) {
      throw new AppError("FORBIDDEN", "You cannot delete this document", { i18nKey: "errors.forbidden" });
    }
  }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "document",
      entityId: id,
      projectId: doc.project_id,
      before: { title: doc.title, revision: doc.revision },
    });
  });
}

async function fileProjectIds(ctx: Ctx, fileId: string): Promise<(string | null)[]> {
  const links = await ctx.db
    .select({ entity_type: entityFiles.entity_type, entity_id: entityFiles.entity_id })
    .from(entityFiles)
    .where(eq(entityFiles.file_id, fileId));
  const ids: (string | null)[] = [];
  for (const link of links) {
    if (link.entity_type === "project") {
      ids.push(link.entity_id);
      continue;
    }
    if (link.entity_type === "document") {
      const [doc] = await ctx.db
        .select({ project_id: documents.project_id })
        .from(documents)
        .where(eq(documents.id, link.entity_id))
        .limit(1);
      ids.push(doc?.project_id ?? null);
      continue;
    }
    if (link.entity_type === "wir") {
      const [row] = await ctx.db
        .select({ project_id: wir.project_id })
        .from(wir)
        .where(eq(wir.id, link.entity_id))
        .limit(1);
      ids.push(row?.project_id ?? null);
      continue;
    }
    if (link.entity_type === "daily_report") {
      const [row] = await ctx.db
        .select({ project_id: dailyReports.project_id })
        .from(dailyReports)
        .where(eq(dailyReports.id, link.entity_id))
        .limit(1);
      ids.push(row?.project_id ?? null);
      continue;
    }
    if (link.entity_type === "expense") {
      const [row] = await ctx.db
        .select({ project_id: expenses.project_id })
        .from(expenses)
        .where(eq(expenses.id, link.entity_id))
        .limit(1);
      ids.push(row?.project_id ?? null);
      continue;
    }
    if (link.entity_type === "adjustment") {
      const [row] = await ctx.db
        .select({ project_id: adjustments.project_id })
        .from(adjustments)
        .where(eq(adjustments.id, link.entity_id))
        .limit(1);
      ids.push(row?.project_id ?? null);
      continue;
    }
  }
  return ids;
}

/** Resolves whether the user may download a file by inspecting its entity links. */
export async function canAccessFile(ctx: Ctx, fileId: string): Promise<boolean> {
  const [file] = await ctx.db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return false;
  if (isGlobalProjectRole(ctx.actor.role)) return true;
  if (file.uploaded_by === ctx.actor.id) return true;
  const docProjects = await ctx.db
    .select({ project_id: documents.project_id })
    .from(documents)
    .where(eq(documents.file_id, fileId))
    .limit(10);
  for (const d of docProjects) {
    if (d.project_id && (await hasProjectAccess(ctx.actor, d.project_id))) return true;
  }
  const projectIds = await fileProjectIds(ctx, fileId);
  for (const pid of projectIds) {
    if (pid && (await hasProjectAccess(ctx.actor, pid))) return true;
  }
  return false;
}

export async function getEntityFiles(ctx: Ctx, entityType: string, entityId: string) {
  return ctx.db
    .select({
      id: files.id,
      name: files.name,
      mime: files.mime,
      size: files.size,
      created_at: files.created_at,
      label: entityFiles.label,
    })
    .from(entityFiles)
    .innerJoin(files, eq(files.id, entityFiles.file_id))
    .where(and(eq(entityFiles.entity_type, entityType), eq(entityFiles.entity_id, entityId)));
}

export async function getFileRow(ctx: Ctx, fileId: string) {
  return ctx.db.select().from(files).where(eq(files.id, fileId)).limit(1).then((r) => r[0] ?? null);
}
