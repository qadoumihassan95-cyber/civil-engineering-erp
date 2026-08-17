import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getDailyReport, findReportProject } from "@/server/services/dailyReports";
import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatNumber, formatDateTime } from "@/server/i18n";
import { PrintButton } from "@/components/print/print-button";

export const dynamic = "force-dynamic";

export default async function PrintDailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projectId = await findReportProject(ctx, id);
  const [report, project] = await Promise.all([getDailyReport(ctx, projectId, id), getProject(ctx, projectId)]);

  const fmt = (v: string) => formatNumber(v, locale);
  const weather = (report.weather ?? {}) as { condition?: string; temp_min?: number | null; temp_max?: number | null; wind?: string };

  const Section = ({ title, rows }: { title: string; rows: { key: string; left: React.ReactNode; right?: React.ReactNode }[] }) =>
    rows.length === 0 ? null : (
      <div className="mt-5">
        <div className="mb-1.5 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm">
            <div className="min-w-0">{r.left}</div>
            {r.right !== undefined && <div className="shrink-0 font-mono text-xs">{r.right}</div>}
          </div>
        ))}
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <PrintButton />
      <div className="print-area mx-auto max-w-3xl bg-white p-10 shadow">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-lg font-bold text-slate-900">{t("app.name")}</div>
            <div className="text-xs text-slate-500">{t("print.dailyReportTitle")}</div>
          </div>
          <div className="text-end">
            <div className="text-sm font-bold text-slate-900">{report.report_date}</div>
            <div className="text-xs text-slate-500">{project.code} — {project.name}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("dailyReport.weatherCondition")}</div>
            <div>{weather.condition ? t(`dailyReport.${weather.condition}`) : "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("dailyReport.tempMin")} / {t("dailyReport.tempMax")}</div>
            <div>
              {weather.temp_min != null ? weather.temp_min : "—"} / {weather.temp_max != null ? weather.temp_max : "—"} °C
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("common.status")}</div>
            <div className="font-semibold">{t(`dailyReport.status${cap(report.status)}`)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("common.submittedBy")}</div>
            <div>{report.submitter_name ?? "—"}</div>
          </div>
        </div>

        {report.site_conditions && (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">{report.site_conditions}</div>
        )}

        <Section
          title={t("dailyReport.manpower")}
          rows={report.manpower.map((m) => ({ key: m.id, left: m.labor_type, right: String(m.count) }))}
        />
        <Section
          title={t("dailyReport.equipment")}
          rows={report.equipment.map((e) => ({ key: e.id, left: e.name, right: e.hours ? `${e.hours} ${t("units.hour")}` : "" }))}
        />
        <Section
          title={t("dailyReport.activities")}
          rows={report.activities.map((a) => ({
            key: a.id,
            left: (
              <span>
                {a.item_code && <span className="me-1.5 font-mono text-[10px] font-bold text-primary-700">{a.item_code}</span>}
                {a.description}
                {a.location ? <span className="text-xs text-slate-400"> — {a.location}</span> : null}
              </span>
            ),
            right: `${fmt(a.qty)} ${a.unit ?? ""}`,
          }))}
        />
        <Section
          title={t("dailyReport.materialsReceived")}
          rows={report.materials_received.map((m) => ({ key: m.id, left: m.name + (m.supplier ? ` — ${m.supplier}` : ""), right: `${fmt(m.qty)} ${m.unit ?? ""}` }))}
        />
        <Section
          title={t("dailyReport.materialsConsumed")}
          rows={report.materials_consumed.map((m) => ({ key: m.id, left: m.name, right: `${fmt(m.qty)} ${m.unit ?? ""}` }))}
        />
        <Section
          title={t("dailyReport.subcontractors")}
          rows={report.subcontractors.map((s) => ({
            key: s.id,
            left: (
              <span>
                <b>{s.name}</b>
                {s.work_done ? <span className="text-xs text-slate-500"> — {s.work_done}</span> : null}
              </span>
            ),
            right: s.crew_count != null ? String(s.crew_count) : "",
          }))}
        />
        <Section
          title={t("dailyReport.delays")}
          rows={report.delays.map((d) => ({
            key: d.id,
            left: d.description + (d.party ? ` (${d.party})` : ""),
            right: d.duration_hours ? `${d.duration_hours} ${t("units.hour")}` : "",
          }))}
        />
        <Section
          title={t("dailyReport.incidents")}
          rows={report.incidents.map((i) => ({ key: i.id, left: `${i.severity ? `[${t(`dailyReport.severity${cap(i.severity)}`)}] ` : ""}${i.description}${i.action_taken ? ` — ${i.action_taken}` : ""}` }))}
        />
        <Section
          title={t("dailyReport.safety")}
          rows={report.safety.map((s) => ({ key: s.id, left: s.observation + (s.action ? ` — ${s.action}` : "") }))}
        />
        <Section
          title={t("dailyReport.visitors")}
          rows={report.visitors.map((v) => ({ key: v.id, left: `${v.name}${v.organization ? ` (${v.organization})` : ""}${v.purpose ? ` — ${v.purpose}` : ""}` }))}
        />

        {report.notes && (
          <div className="mt-5">
            <div className="mb-1.5 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{t("dailyReport.notes")}</div>
            <p className="mt-1.5 text-sm">{report.notes}</p>
          </div>
        )}

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-sm">
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{report.submitter_name ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.preparedBy")}</div>
            <div className="text-[10px] text-slate-400">{t("common.signatureNote")}</div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{report.reviewer_name ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.reviewedLine")}</div>
            <div className="text-[10px] text-slate-400">
              {report.reviewed_at ? formatDateTime(report.reviewed_at, locale) : t("common.none")}
            </div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{t(`dailyReport.status${cap(report.status)}`)}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.statusLine")}</div>
            <div className="text-[10px] text-slate-400">{t("print.electronicApproval")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
