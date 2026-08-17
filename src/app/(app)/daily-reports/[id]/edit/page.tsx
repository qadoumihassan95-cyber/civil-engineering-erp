import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getDailyReport, findReportProject } from "@/server/services/dailyReports";
import { listItemsWithQuantities } from "@/server/services/boq";
import { listMaterials } from "@/server/services/inventory";
import { getAuthUser } from "@/server/auth/context";
import { requireProjectPermission } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { DailyReportForm } from "@/components/daily-report/daily-report-form";

export const dynamic = "force-dynamic";

export default async function EditDailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projectId = await findReportProject(ctx, id);
  await requireProjectPermission(user, projectId, "dr:create");
  const report = await getDailyReport(ctx, projectId, id);
  if (report.status !== "draft" && report.status !== "rejected") {
    return <p className="text-sm text-slate-500">{t("dailyReport.canEditDraft")}</p>;
  }
  const [boqItems, materials] = await Promise.all([
    listItemsWithQuantities(ctx, projectId),
    listMaterials(ctx),
  ]);
  const weather = (report.weather ?? {}) as { condition?: string; temp_min?: number | null; temp_max?: number | null; wind?: string };
  return (
    <DailyReportForm
      projectId={projectId}
      reportId={id}
      boqItems={boqItems.map((b) => ({ id: b.id, code: b.code, description: b.description, unit: b.unit }))}
      materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
      initial={{
        report_date: report.report_date,
        weather_condition: weather.condition ?? "",
        temp_min: weather.temp_min != null ? String(weather.temp_min) : "",
        temp_max: weather.temp_max != null ? String(weather.temp_max) : "",
        wind: weather.wind ?? "",
        site_conditions: report.site_conditions ?? "",
        notes: report.notes ?? "",
        manpower: report.manpower.map((m) => ({ labor_type: m.labor_type, count: String(m.count) })),
        subcontractors: report.subcontractors.map((s) => ({
          name: s.name,
          crew_count: s.crew_count != null ? String(s.crew_count) : "",
          work_done: s.work_done ?? "",
        })),
        equipment: report.equipment.map((e) => ({ name: e.name, hours: e.hours ?? "", notes: e.notes ?? "" })),
        activities: report.activities.map((a) => ({
          boq_item_id: a.boq_item_id ?? "",
          description: a.description,
          qty: a.qty,
          unit: a.unit ?? "",
          location: a.location ?? "",
        })),
        materials_received: report.materials_received.map((m) => ({
          material_id: m.material_id ?? "",
          name: m.name,
          qty: m.qty,
          unit: m.unit ?? "",
          supplier: m.supplier ?? "",
        })),
        materials_consumed: report.materials_consumed.map((m) => ({
          material_id: m.material_id ?? "",
          name: m.name,
          qty: m.qty,
          unit: m.unit ?? "",
          source: m.source ?? "",
        })),
        delays: report.delays.map((d) => ({
          description: d.description,
          duration_hours: d.duration_hours ?? "",
          party: d.party ?? "",
        })),
        incidents: report.incidents.map((i) => ({
          description: i.description,
          severity: i.severity ?? "",
          action_taken: i.action_taken ?? "",
        })),
        safety: report.safety.map((s) => ({ observation: s.observation, action: s.action ?? "" })),
        visitors: report.visitors.map((v) => ({ name: v.name, organization: v.organization ?? "", purpose: v.purpose ?? "" })),
        file_ids: report.attachments.map((f) => f.id),
      }}
    />
  );
}
