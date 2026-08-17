import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  projects,
  wir,
  boqItems,
  materials,
  suppliers,
  dailyReports,
  documents,
  expenses,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { isGlobalProjectRole } from "@/server/auth/context";

const LIMIT = 8;

export interface ProjectHit {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  status: string;
  location: string | null;
}
export interface WirHit {
  id: string;
  project_id: string;
  number: string;
  location: string;
  status: string;
  description: string | null;
}
export interface BoqHit {
  id: string;
  project_id: string;
  code: string;
  description: string;
  unit: string;
}
export interface MaterialHit {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  unit: string;
}
export interface SupplierHit {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
}
export interface ReportHit {
  id: string;
  project_id: string;
  report_date: string;
  status: string;
  notes: string | null;
}
export interface DocumentHit {
  id: string;
  project_id: string | null;
  title: string;
  kind: string;
  revision: string;
  series_key: string;
}
export interface ExpenseHit {
  id: string;
  project_id: string;
  number: string;
  supplier_name: string | null;
  status: string;
  total: string;
}

export interface SearchResults {
  projects: ProjectHit[];
  wirs: WirHit[];
  boqItems: BoqHit[];
  materials: MaterialHit[];
  suppliers: SupplierHit[];
  dailyReports: ReportHit[];
  documents: DocumentHit[];
  expenses: ExpenseHit[];
}

async function visibleScope(ctx: Ctx): Promise<string[] | null> {
  if (isGlobalProjectRole(ctx.actor.role)) return null;
  const membership = await ctx.db.execute(
    sql`select project_id from project_members where user_id = ${ctx.actor.id}`,
  );
  const ids = (membership as unknown as { project_id: string }[]).map((r) => r.project_id);
  if (!ids.length) return [];
  return ids;
}

export async function globalSearch(ctx: Ctx, query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) {
    return { projects: [], wirs: [], boqItems: [], materials: [], suppliers: [], dailyReports: [], documents: [], expenses: [] };
  }
  const like = `%${q}%`;
  const scope = await visibleScope(ctx);
  const scoped = <_T extends { project_id: string }>(col: unknown, apply: boolean) =>
    apply && scope !== null ? (scope.length ? inArray(col as never, scope) : sql`false`) : undefined;

  const [projectsRows, wirRows, boqRows, matRows, supRows, drRows, docRows, expRows] = await Promise.all([
    ctx.db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        client_name: projects.client_name,
        status: projects.status,
        location: projects.location,
      })
      .from(projects)
      .where(
        or(
          sql`${projects.code} ilike ${like}`,
          sql`${projects.name} ilike ${like}`,
          sql`${projects.client_name} ilike ${like}`,
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({
        id: wir.id,
        project_id: wir.project_id,
        number: wir.number,
        location: wir.location,
        status: wir.status,
        description: wir.description,
      })
      .from(wir)
      .where(
        and(
          ...(scoped(wir.project_id, true) ? [scoped(wir.project_id, true)] : []),
          or(
            sql`${wir.number} ilike ${like}`,
            sql`${wir.location} ilike ${like}`,
            sql`${wir.description} ilike ${like}`,
          ),
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({
        id: boqItems.id,
        project_id: boqItems.project_id,
        code: boqItems.code,
        description: boqItems.description,
        unit: boqItems.unit,
      })
      .from(boqItems)
      .where(
        and(
          ...(scoped(boqItems.project_id, true) ? [scoped(boqItems.project_id, true)] : []),
          or(
            sql`${boqItems.code} ilike ${like}`,
            sql`${boqItems.description} ilike ${like}`,
          ),
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({ id: materials.id, code: materials.code, name: materials.name, name_ar: materials.name_ar, unit: materials.unit })
      .from(materials)
      .where(
        or(
          sql`${materials.code} ilike ${like}`,
          sql`${materials.name} ilike ${like}`,
          sql`${materials.name_ar} ilike ${like}`,
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({ id: suppliers.id, name: suppliers.name, contact_person: suppliers.contact_person, phone: suppliers.phone })
      .from(suppliers)
      .where(or(sql`${suppliers.name} ilike ${like}`, sql`${suppliers.contact_person} ilike ${like}`))
      .limit(LIMIT),
    ctx.db
      .select({
        id: dailyReports.id,
        project_id: dailyReports.project_id,
        report_date: dailyReports.report_date,
        status: dailyReports.status,
        notes: dailyReports.notes,
      })
      .from(dailyReports)
      .where(
        and(
          ...(scoped(dailyReports.project_id, true) ? [scoped(dailyReports.project_id, true)] : []),
          sql`${dailyReports.notes} ilike ${like}`,
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({
        id: documents.id,
        project_id: documents.project_id,
        title: documents.title,
        kind: documents.kind,
        revision: documents.revision,
        series_key: documents.series_key,
      })
      .from(documents)
      .where(
        and(
          eq(documents.status, "current"),
          or(sql`${documents.title} ilike ${like}`, sql`${documents.series_key} ilike ${like}`),
        ),
      )
      .limit(LIMIT),
    ctx.db
      .select({
        id: expenses.id,
        project_id: expenses.project_id,
        number: expenses.number,
        supplier_name: expenses.supplier_name,
        status: expenses.status,
        total: expenses.total,
      })
      .from(expenses)
      .where(
        and(
          ...(scoped(expenses.project_id, true) ? [scoped(expenses.project_id, true)] : []),
          or(sql`${expenses.number} ilike ${like}`, sql`${expenses.supplier_name} ilike ${like}`),
        ),
      )
      .limit(LIMIT),
  ]);

  return {
    projects: projectsRows,
    wirs: wirRows,
    boqItems: boqRows,
    materials: matRows,
    suppliers: supRows,
    dailyReports: drRows,
    documents: docRows,
    expenses: expRows,
  };
}
