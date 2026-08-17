import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listAudit } from "@/server/services/audit";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatDateTime } from "@/server/i18n";
import { Card, EmptyState, PageHeader } from "@/components/ui/surfaces";
import { Badge } from "@/components/ui/controls";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_type?: string; action?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const data = await listAudit(ctx, {
    entityType: sp.entity_type,
    action: sp.action,
    page: Number(sp.page ?? 1),
    pageSize: 50,
  });

  return (
    <div>
      <PageHeader title={t("admin.auditTitle")} subtitle={t("admin.auditHint")} />
      <Card>
        {data.rows.length === 0 ? (
          <EmptyState title={t("common.emptyState")} />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.rows.map((a) => (
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={actionTone(a.action)}>{a.action}</Badge>
                    <span className="text-sm font-semibold text-slate-800">{a.entity_type}</span>
                    <span className="font-mono text-xs text-slate-400">{a.entity_id.slice(0, 8)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {a.actor_name} · {a.actor_role ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-end text-xs text-slate-400">
                  {formatDateTime(a.created_at, locale)}
                </div>
              </div>
            ))}
          </div>
        )}
        {data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-3 text-xs text-slate-500">
            <span>
              {t("common.showing")} {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} {t("common.of")} {data.total}
            </span>
            <div className="flex gap-2">
              {data.page > 1 && (
                <a href={`/admin/audit?page=${data.page - 1}${sp.entity_type ? `&entity_type=${sp.entity_type}` : ""}`} className="text-primary-600 hover:underline">←</a>
              )}
              {data.page * data.pageSize < data.total && (
                <a href={`/admin/audit?page=${data.page + 1}${sp.entity_type ? `&entity_type=${sp.entity_type}` : ""}`} className="text-primary-600 hover:underline">→</a>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function actionTone(action: string): "green" | "red" | "amber" | "blue" | "slate" {
  if (action === "approved" || action === "posted" || action === "created") return "green";
  if (action === "deleted" || action === "rejected") return "red";
  if (action === "returned" || action === "submitted") return "amber";
  if (action === "updated") return "blue";
  return "slate";
}
