import { cookies } from "next/headers";
import { getDb } from "@/db";
import { computeProjectProgress } from "@/server/services/projects";
import { listItemsWithQuantities } from "@/server/services/boq";
import { listWirs } from "@/server/services/wir";
import { listExpenses } from "@/server/services/expenses";
import { getStockLevels } from "@/server/services/inventory";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT, formatNumber, formatMoney } from "@/server/i18n";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surfaces";
import { ProgressBar } from "@/components/ui/controls";
import { d } from "@/server/lib/decimal";

export const dynamic = "force-dynamic";

export default async function ProjectControlsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [progress, items, _wirs, expenses, stock] = await Promise.all([
    computeProjectProgress(ctx, id),
    listItemsWithQuantities(ctx, id),
    listWirs(ctx, id),
    listExpenses(ctx, { projectId: id, pageSize: 1000 }),
    getStockLevels(ctx, { projectId: id }),
  ]);

  const fmtQ = (v: string) => formatNumber(v, locale, { maximumFractionDigits: 4 });
  const fmtM = (v: string) => formatMoney(v, locale);

  const executed = progress.executedValue;
  const approved = progress.approvedValue;
  const submittedValue = progress.submittedValue;
  const certified = progress.certifiedValue;
  const contract = progress.contractValue;

  const costRows = expenses.rows.filter((e) => e.status === "approved");
  const actualCost = d(costRows.reduce((a, e) => a + parseFloat(e.total), 0)).toFixed(3);
  const committed = stock.reduce((a, s) => a + parseFloat(s.value), 0);

  const executedVsApproved = d(executed).minus(approved);
  const executedVsApprovedPct =
    parseFloat(executed) > 0 ? d(executedVsApproved).div(executed).times(100).toFixed(2) : "0";

  const variance = d(contract).minus(approved).toFixed(3);
  const costVariance = d(approved).minus(actualCost).toFixed(3);

  const earned = parseFloat(approved) > 0 && parseFloat(actualCost) > 0 ? (parseFloat(approved) / parseFloat(actualCost)).toFixed(2) : null;

  return (
    <div>
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.transparency")}
        actions={
          hasPermission(user.role, "export:use") ? (
            <a href={`/api/projects/${id}/exports?type=summary`} target="_blank" className="no-print inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50" rel="noreferrer">
              {t("reports.exportProjectReport")}
            </a>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <div className="text-xs text-slate-500">{t("reports.contractValue")}</div>
          <div className="text-xl font-bold text-slate-900">{fmtM(contract)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t("reports.approvedValue")}</div>
          <div className="text-xl font-bold text-emerald-600">{fmtM(approved)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t("reports.costToDate")}</div>
          <div className="text-xl font-bold text-rose-600">{fmtM(actualCost)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t("reports.margin")}</div>
          <div className={`text-xl font-bold ${parseFloat(costVariance) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {fmtM(costVariance)}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("reports.varianceTitle")} />
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{t("reports.approved")} / {t("reports.budget")}</span>
              <span className="font-bold text-slate-800">{progress.progressPercent}%</span>
            </div>
            <ProgressBar value={parseFloat(progress.progressPercent)} tone={parseFloat(progress.progressPercent) > 70 ? "green" : parseFloat(progress.progressPercent) > 40 ? "blue" : "amber"} />
          </div>
          <div className="space-y-2.5">
            <VarianceRow label={t("reports.executed")} value={fmtM(executed)} hint={`${progress.executedPercent}%`} />
            <VarianceRow label={t("reports.submitted")} value={fmtM(submittedValue)} />
            <VarianceRow label={t("reports.approved")} value={fmtM(approved)} tone="green" />
            <VarianceRow label={t("reports.certified")} value={fmtM(certified)} tone="violet" />
            <VarianceRow label={t("reports.remaining")} value={fmtM(variance)} tone="amber" />
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>{t("reports.variance")} ({t("reports.executed")} − {t("reports.approved")})</span>
                <span className={`font-bold ${parseFloat(executedVsApproved.toString()) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {fmtM(executedVsApproved.toString())} ({executedVsApprovedPct}%)
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {t("reports.varianceExplanations")}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("reports.costVariance")} />
          <div className="space-y-2.5">
            <VarianceRow label={t("reports.budget")} value={fmtM(contract)} />
            <VarianceRow label={t("reports.actual")} value={fmtM(actualCost)} tone="red" />
            <VarianceRow label={t("reports.committed")} value={fmtM(String(committed))} />
            <VarianceRow label={t("reports.earned")} value={fmtM(approved)} tone="green" />
            {earned !== null && (
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                <span>{t("reports.cpi")}: </span>
                <span className={`font-bold ${parseFloat(earned) >= 1 ? "text-emerald-600" : "text-rose-600"}`}>{earned}</span>
                <span className="ms-1 text-slate-400">({t("reports.earned")} ÷ {t("reports.actual")})</span>
              </div>
            )}
            {earned === null && <p className="text-xs text-slate-400">{t("reports.noCostData")}</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t("reports.progressByItem")} />
        {items.length === 0 ? (
          <EmptyState title={t("boq.noItems")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t("boq.code")}</th>
                  <th className="px-3 py-2 text-start">{t("boq.description")}</th>
                  <th className="px-3 py-2 text-end">{t("reports.planned")}</th>
                  <th className="px-3 py-2 text-end">{t("reports.executed")}</th>
                  <th className="px-3 py-2 text-end">{t("reports.approved")}</th>
                  <th className="px-3 py-2 text-end">{t("reports.certified")}</th>
                  <th className="px-3 py-2 text-end">{t("reports.variance")}</th>
                  <th className="w-32 px-3 py-2 text-end">{t("projects.progress")}</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 30).map((it) => {
                  const itemVar = d(it.executed_qty).minus(it.approved_qty);
                  return (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{it.code}</td>
                      <td className="max-w-56 truncate px-3 py-2 text-xs text-slate-600">{it.description}</td>
                      <td className="px-3 py-2 text-end font-mono text-xs">{fmtQ(it.contract_qty)}</td>
                      <td className="px-3 py-2 text-end font-mono text-xs">{fmtQ(it.executed_qty)}</td>
                      <td className="px-3 py-2 text-end font-mono text-xs font-semibold text-emerald-700">{fmtQ(it.approved_qty)}</td>
                      <td className="px-3 py-2 text-end font-mono text-xs">{it.certified_qty ? fmtQ(it.certified_qty) : "—"}</td>
                      <td className={`px-3 py-2 text-end font-mono text-xs ${itemVar.isPositive() ? "text-amber-600" : "text-emerald-600"}`}>
                        {fmtQ(itemVar.toDecimalPlaces(4).toString())}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className="w-10 text-end font-mono text-xs">{it.progress}%</span>
                          <div className="w-16"><ProgressBar value={parseFloat(it.progress)} /></div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function VarianceRow({ label, value, tone, hint }: { label: string; value: string; tone?: "green" | "amber" | "red" | "violet"; hint?: string }) {
  const tones = {
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-rose-700",
    violet: "text-violet-700",
  };
  return (
    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-mono text-sm font-semibold ${tone ? tones[tone] : "text-slate-800"}`}>
        {value}
        {hint && <span className="ms-1.5 text-xs font-normal text-slate-400">({hint})</span>}
      </span>
    </div>
  );
}
