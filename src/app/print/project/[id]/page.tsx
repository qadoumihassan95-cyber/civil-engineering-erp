import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getProject, getProjectSummary, getProjectMembers } from "@/server/services/projects";
import { listItemsWithQuantities } from "@/server/services/boq";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatNumber, formatMoney, formatDate } from "@/server/i18n";
import { PrintButton } from "@/components/print/print-button";

export const dynamic = "force-dynamic";

export default async function PrintProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [project, summary, members, items] = await Promise.all([
    getProject(ctx, id),
    getProjectSummary(ctx, id),
    getProjectMembers(ctx, id),
    listItemsWithQuantities(ctx, id),
  ]);

  const fmtQ = (v: string) => formatNumber(v, locale, { maximumFractionDigits: 4 });
  const fmtM = (v: string) => formatMoney(v, locale);

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <PrintButton />
      <div className="print-area mx-auto max-w-4xl bg-white p-10 shadow">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-lg font-bold text-slate-900">{t("app.name")}</div>
            <div className="text-xs text-slate-500">{t("print.projectReportTitle")}</div>
          </div>
          <div className="text-end">
            <div className="text-sm font-bold">{project.code}</div>
            <div className="text-xs text-slate-500">{t(`projects.status${cap(project.status)}`)}</div>
          </div>
        </div>

        <h1 className="mt-5 text-xl font-bold">{project.name}</h1>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("print.client")}</div>
            <div>{project.client_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("print.consultant")}</div>
            <div>{project.consultant_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("print.contractor")}</div>
            <div>{project.contractor_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("projects.location")}</div>
            <div>{project.location ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("projects.startDate")}</div>
            <div>{formatDate(project.start_date, locale)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("projects.plannedEnd")}</div>
            <div>{formatDate(project.planned_end_date, locale)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("projects.contractValue")}</div>
            <div className="font-bold">{fmtM(summary.contractValue)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("projects.progress")}</div>
            <div className="font-bold">{summary.progressPercent}%</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            {t("boq.title")}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1.5 text-start">{t("boq.code")}</th>
                <th className="py-1.5 text-start">{t("boq.description")}</th>
                <th className="py-1.5 text-end">{t("boq.contractQty")}</th>
                <th className="py-1.5 text-end">{t("boq.unitRate")}</th>
                <th className="py-1.5 text-end">{t("boq.executed")}</th>
                <th className="py-1.5 text-end">{t("boq.approved")}</th>
                <th className="py-1.5 text-end">{t("boq.remaining")}</th>
                <th className="py-1.5 text-end">{t("boq.progress")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100">
                  <td className="py-1.5 font-mono">{it.code}</td>
                  <td className="max-w-72 truncate py-1.5">{it.description}</td>
                  <td className="py-1.5 text-end font-mono">{fmtQ(it.contract_qty)}</td>
                  <td className="py-1.5 text-end font-mono">{fmtM(it.unit_rate)}</td>
                  <td className="py-1.5 text-end font-mono">{fmtQ(it.executed_qty)}</td>
                  <td className="py-1.5 text-end font-mono font-semibold">{fmtQ(it.approved_qty)}</td>
                  <td className="py-1.5 text-end font-mono">{fmtQ(it.remaining_qty)}</td>
                  <td className="py-1.5 text-end font-mono">{it.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-sm">
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{members[0]?.name ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.preparedBy")}</div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1">&nbsp;</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.reviewedLine")}</div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1">&nbsp;</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.statusLine")}</div>
          </div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400">{t("print.electronicApproval")}</p>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
