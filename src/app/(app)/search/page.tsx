import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { globalSearch } from "@/server/services/search";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatMoney, formatDate } from "@/server/i18n";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const results = q.trim().length >= 2 ? await globalSearch(ctx, q) : null;

  const total = results
    ? results.projects.length + results.wirs.length + results.boqItems.length + results.materials.length +
      results.suppliers.length + results.dailyReports.length + results.documents.length + results.expenses.length
    : 0;

  return (
    <div>
      <PageHeader title={t("search.title")} subtitle={t("search.hint")} />
      {!results ? (
        <EmptyState title={t("search.noQuery")} />
      ) : total === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {results.projects.length > 0 && (
            <Card>
              <CardHeader title={t("search.projects")} />
              <div className="space-y-2">
                {results.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="font-mono text-xs font-bold text-primary-700">{p.code}</span>
                    <span className="ms-2 text-sm font-medium text-slate-800">{p.name}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.wirs.length > 0 && (
            <Card>
              <CardHeader title={t("search.wirs")} />
              <div className="space-y-2">
                {results.wirs.map((w) => (
                  <Link key={w.id} href={`/wir/${w.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <div>
                      <span className="font-mono text-xs font-bold">{w.number}</span>
                      <span className="ms-2 text-sm text-slate-600">{w.location}</span>
                    </div>
                    <StatusBadge kind="wir" status={w.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.boqItems.length > 0 && (
            <Card>
              <CardHeader title={t("search.boqItems")} />
              <div className="space-y-2">
                {results.boqItems.map((b) => (
                  <Link key={b.id} href={`/projects/${b.project_id}/boq`} className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="font-mono text-xs font-bold">{b.code}</span>
                    <span className="ms-2 text-sm text-slate-600">{b.description.slice(0, 80)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.materials.length > 0 && (
            <Card>
              <CardHeader title={t("search.materials")} />
              <div className="space-y-2">
                {results.materials.map((m) => (
                  <Link key={m.id} href="/inventory/materials" className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="font-mono text-xs font-bold">{m.code}</span>
                    <span className="ms-2 text-sm text-slate-600">{m.name}</span>
                    <span className="ms-2 text-xs text-slate-400">{m.unit}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.suppliers.length > 0 && (
            <Card>
              <CardHeader title={t("search.suppliers")} />
              <div className="space-y-2">
                {results.suppliers.map((s) => (
                  <Link key={s.id} href="/inventory/suppliers" className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    {s.phone && <span className="ms-2 text-xs text-slate-400">{s.phone}</span>}
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.dailyReports.length > 0 && (
            <Card>
              <CardHeader title={t("search.dailyReports")} />
              <div className="space-y-2">
                {results.dailyReports.map((r) => (
                  <Link key={r.id} href={`/daily-reports/${r.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{formatDate(r.report_date, locale)}</span>
                    <StatusBadge kind="daily_report" status={r.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.documents.length > 0 && (
            <Card>
              <CardHeader title={t("search.documents")} />
              <div className="space-y-2">
                {results.documents.map((d) => (
                  <Link key={d.id} href="/documents" className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{d.title}</span>
                    <span className="ms-2 text-xs text-slate-400">{t("documents.revisionShort", { n: d.revision })}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {results.expenses.length > 0 && (
            <Card>
              <CardHeader title={t("search.expenses")} />
              <div className="space-y-2">
                {results.expenses.map((e) => (
                  <Link key={e.id} href={`/expenses?open=${e.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <div>
                      <span className="font-mono text-xs font-bold">{e.number}</span>
                      <span className="ms-2 text-sm text-slate-600">{e.supplier_name ?? ""}</span>
                    </div>
                    <span className="font-mono text-xs">{formatMoney(e.total, locale)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
