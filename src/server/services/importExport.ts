import { eq } from "drizzle-orm";
import { boqSections, boqItems, materials, materialCategories } from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { requireProjectPermission, requirePermission } from "@/server/auth/context";
import { parseCsv, rowsToObjects, stringifyCsv, excelSafe } from "@/server/lib/csv";
import { mulMoney } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";
import { listItemsWithQuantities } from "./boq";
import { getStockReport } from "./inventory";
import { listWirs } from "./wir";
import { listExpenses } from "./expenses";

export interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

const BOQ_HEADERS = ["section_code", "section_title", "item_code", "description", "unit", "contract_qty", "unit_rate"];

export async function importBoqCsv(ctx: Ctx, projectId: string, csvText: string): Promise<ImportResult> {
  await requireProjectPermission(ctx.actor, projectId, "boq:manage");
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (!rows.length) {
    return { imported: 0, errors: [{ row: 0, message: "Empty file" }] };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = BOQ_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return { imported: 0, errors: [{ row: 0, message: `Missing columns: ${missing.join(", ")}` }] };
  }
  const data = rowsToObjects(rows);
  const errors: ImportResult["errors"] = [];
  const sections = new Map<string, { id: string; code: string; title: string; sort: number }>();
  const toInsert: (typeof boqItems.$inferInsert)[] = [];
  const sectionSort = new Map<string, number>();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowNum = i + 2;
    const secCode = (r.section_code ?? "").trim();
    const secTitle = (r.section_title ?? "").trim();
    const code = (r.item_code ?? "").trim();
    const desc = (r.description ?? "").trim();
    const unit = (r.unit ?? "").trim();
    const qty = (r.contract_qty ?? "").trim();
    const rate = (r.unit_rate ?? "").trim();

    if (!secCode || !secTitle) {
      errors.push({ row: rowNum, message: "Section code/title missing" });
      continue;
    }
    if (!code || !desc || !unit) {
      errors.push({ row: rowNum, message: "Item code/description/unit missing" });
      continue;
    }
    if (!/^\d+(\.\d{1,4})?$/.test(qty)) {
      errors.push({ row: rowNum, message: `Invalid contract quantity: "${qty}"` });
      continue;
    }
    if (!/^\d+(\.\d{1,3})?$/.test(rate)) {
      errors.push({ row: rowNum, message: `Invalid unit rate: "${rate}"` });
      continue;
    }
    if (!sections.has(secCode)) {
      sections.set(secCode, {
        id: newId(),
        code: secCode,
        title: secTitle,
        sort: sections.size + 1,
      });
      sectionSort.set(secCode, sections.size);
    }
    toInsert.push({
      project_id: projectId,
      section_id: sections.get(secCode)!.id,
      code,
      description: desc,
      unit,
      contract_qty: qty,
      unit_rate: rate,
      contract_amount: mulMoney(qty, rate),
      sort: (sectionSort.get(secCode) ?? 0) * 1000 + toInsert.length,
    });
  }

  if (!errors.length && toInsert.length) {
    await ctx.db.transaction(async (tx) => {
      for (const [, sec] of sections) {
        await tx.insert(boqSections).values({
          id: sec.id,
          project_id: projectId,
          code: sec.code,
          title: sec.title,
          sort: sec.sort,
        });
      }
      await tx.insert(boqItems).values(toInsert);
      await audit({ db: tx as never, actor: ctx.actor }, {
        action: "import",
        entityType: "boq",
        entityId: projectId,
        projectId,
        after: { imported: toInsert.length },
      });
    });
  }
  return { imported: errors.length ? 0 : toInsert.length, errors };
}

const MATERIAL_HEADERS = ["code", "name", "name_ar", "category", "unit", "min_stock"];

export async function importMaterialsCsv(ctx: Ctx, csvText: string): Promise<ImportResult> {
  requirePermission(ctx.actor, "inventory:transact");
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (!rows.length) return { imported: 0, errors: [{ row: 0, message: "Empty file" }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = MATERIAL_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return { imported: 0, errors: [{ row: 0, message: `Missing columns: ${missing.join(", ")}` }] };
  }
  const data = rowsToObjects(rows);
  const errors: ImportResult["errors"] = [];
  const toInsert: (typeof materials.$inferInsert)[] = [];
  const categories = new Map<string, string>();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowNum = i + 2;
    const code = (r.code ?? "").trim();
    const name = (r.name ?? "").trim();
    const unit = (r.unit ?? "").trim();
    const cat = (r.category ?? "").trim();
    const minStock = (r.min_stock ?? "0").trim();
    if (!code || !name || !unit) {
      errors.push({ row: rowNum, message: "Code/name/unit required" });
      continue;
    }
    if (!/^\d+(\.\d{1,4})?$/.test(minStock)) {
      errors.push({ row: rowNum, message: `Invalid min_stock: "${minStock}"` });
      continue;
    }
    if (cat && !categories.has(cat)) {
      const existing = await ctx.db
        .select({ id: materialCategories.id })
        .from(materialCategories)
        .where(eq(materialCategories.name, cat))
        .limit(1);
      if (existing.length) categories.set(cat, existing[0].id);
      else {
        const id = newId();
        await ctx.db.insert(materialCategories).values({ id, name: cat });
        categories.set(cat, id);
      }
    }
    toInsert.push({
      code,
      name,
      name_ar: (r.name_ar ?? "").trim() || null,
      category_id: cat ? categories.get(cat) ?? null : null,
      unit,
      min_stock: minStock,
    });
  }

  if (!errors.length && toInsert.length) {
    await ctx.db.transaction(async (tx) => {
      await tx.insert(materials).values(toInsert);
      await audit({ db: tx as never, actor: ctx.actor }, {
        action: "import",
        entityType: "material",
        entityId: "-",
        after: { imported: toInsert.length },
      });
    });
  }
  return { imported: errors.length ? 0 : toInsert.length, errors };
}

export async function exportBoqCsv(ctx: Ctx, projectId: string): Promise<string> {
  await requireProjectPermission(ctx.actor, projectId, "export:use");
  const items = await listItemsWithQuantities(ctx, projectId);
  const sectionById = new Map(
    (await ctx.db.select().from(boqSections).where(eq(boqSections.project_id, projectId))).map((s) => [s.id, s]),
  );
  const rows: (string | number)[][] = [
    ["Section", "Item Code", "Description", "Unit", "Contract Qty", "Unit Rate", "Contract Amount", "Executed", "Submitted", "Approved", "Remaining", "Progress %"],
  ];
  for (const it of items) {
    rows.push([
      excelSafe(sectionById.get(it.section_id ?? "")?.code ?? ""),
      excelSafe(it.code),
      excelSafe(it.description),
      it.unit,
      it.contract_qty,
      it.unit_rate,
      it.contract_amount,
      it.executed_qty,
      it.submitted_qty,
      it.approved_qty,
      it.remaining_qty,
      it.progress,
    ]);
  }
  return stringifyCsv(rows);
}

export async function exportWirCsv(ctx: Ctx, projectId: string): Promise<string> {
  await requireProjectPermission(ctx.actor, projectId, "export:use");
  const rows = await listWirs(ctx, projectId);
  const out: (string | number)[][] = [
    ["WIR No.", "BOQ Item", "Description", "Location", "Zone", "Submitted Qty", "Approved Qty", "Unit", "Engineer", "Reviewer", "Status", "Submitted At", "Reviewed At"],
  ];
  for (const w of rows) {
    out.push([
      w.number,
      w.item_code,
      w.item_description,
      excelSafe(w.location),
      w.zone ?? "",
      w.submitted_qty,
      w.approved_qty ?? "",
      w.unit,
      w.engineer_name ?? "",
      w.reviewer_name ?? "",
      w.status,
      w.submitted_at ?? "",
      w.reviewed_at ?? "",
    ]);
  }
  return stringifyCsv(out);
}

export async function exportInventoryCsv(ctx: Ctx, warehouseId?: string): Promise<string> {
  requirePermission(ctx.actor, "export:use");
  const rows = await getStockReport(ctx, { warehouseId });
  const out: (string | number)[][] = [
    ["Material Code", "Material", "Unit", "Warehouse", "On Hand", "Last Cost", "Value", "Min Stock"],
  ];
  for (const r of rows) {
    out.push([r.material_code, excelSafe(r.material_name), r.unit, r.warehouse_code, r.qty, r.last_cost ?? "", r.value, r.min_stock]);
  }
  return stringifyCsv(out);
}

export async function exportExpensesCsv(ctx: Ctx, projectId?: string): Promise<string> {
  requirePermission(ctx.actor, "export:use");
  const { rows } = await listExpenses(ctx, { projectId, pageSize: 1000 });
  const out: (string | number)[][] = [
    ["Expense No.", "Project", "Date", "Category", "Supplier", "Amount", "Tax", "Total", "Method", "Status"],
  ];
  for (const e of rows) {
    out.push([
      e.number,
      e.project_code,
      e.expense_date,
      e.category_name ?? "",
      excelSafe(e.supplier_name ?? ""),
      e.amount,
      e.tax_amount,
      e.total,
      e.payment_method,
      e.status,
    ]);
  }
  return stringifyCsv(out);
}

export async function exportProjectSummaryCsv(ctx: Ctx, projectId: string): Promise<string> {
  await requireProjectPermission(ctx.actor, projectId, "export:use");
  const items = await listItemsWithQuantities(ctx, projectId);
  const wirs = await listWirs(ctx, projectId);
  const out: (string | number)[][] = [
    ["CivilERP — Project BOQ Summary"],
    [],
    ["Item Code", "Description", "Unit", "Contract Qty", "Approved Qty", "Remaining", "Unit Rate", "Contract Amount", "Approved Value", "Progress %"],
  ];
  for (const it of items) {
    out.push([
      it.code,
      excelSafe(it.description),
      it.unit,
      it.contract_qty,
      it.approved_qty,
      it.remaining_qty,
      it.unit_rate,
      it.contract_amount,
      mulMoney(it.approved_qty, it.unit_rate),
      it.progress,
    ]);
  }
  out.push([]);
  out.push(["WIR No.", "BOQ Item", "Submitted Qty", "Approved Qty", "Status", "Submitted At"]);
  for (const w of wirs) {
    out.push([w.number, w.item_code, w.submitted_qty, w.approved_qty ?? "", w.status, w.submitted_at ?? ""]);
  }
  return stringifyCsv(out);
}
