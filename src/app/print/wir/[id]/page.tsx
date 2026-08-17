import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getWir, findWirProject } from "@/server/services/wir";
import { getProject } from "@/server/services/projects";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatNumber, formatDateTime } from "@/server/i18n";
import { PrintButton } from "@/components/print/print-button";

export const dynamic = "force-dynamic";

export default async function PrintWirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const projectId = await findWirProject(ctx, id);
  const [wir, project] = await Promise.all([getWir(ctx, projectId, id), getProject(ctx, projectId)]);

  const fmt = (v: string) => formatNumber(v, locale);

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <PrintButton />
      <div className="print-area mx-auto max-w-3xl bg-white p-10 shadow">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-lg font-bold text-slate-900">{t("app.name")}</div>
            <div className="text-xs text-slate-500">{t("print.wirTitle")}</div>
          </div>
          <div className="text-end">
            <div className="text-sm font-bold text-slate-900">{wir.number}</div>
            <div className="text-xs text-slate-500">{t("wir.title")}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("common.project")}</div>
            <div className="font-semibold">{project.code} — {project.name}</div>
          </div>
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
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("wir.boqItem")}</div>
            <div className="font-mono font-semibold">{wir.item_code}</div>
            <div className="text-xs text-slate-500">{wir.item_description}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("wir.location")}</div>
            <div>{wir.location}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("wir.zone")} / {t("wir.floor")}</div>
            <div>{wir.zone ?? "—"} / {wir.floor ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("common.status")}</div>
            <div className="font-semibold">{t(`wir.status${cap(wir.status)}`)}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 rounded-md border border-slate-200 p-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("wir.submittedQty")}</div>
            <div className="font-mono text-lg font-bold">{fmt(wir.submitted_qty)} {wir.unit}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("wir.approvedQty")}</div>
            <div className="font-mono text-lg font-bold text-emerald-700">
              {wir.approved_qty ? `${fmt(wir.approved_qty)} ${wir.unit}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">{t("boq.remaining")}</div>
            <div className="font-mono text-lg font-bold">{fmt(String(parseFloat(wir.item_contract_qty) - parseFloat(wir.item_approved_qty)))} {wir.unit}</div>
          </div>
        </div>

        {wir.description && (
          <div className="mt-6">
            <div className="text-xs font-semibold text-slate-400">{t("common.description")}</div>
            <div className="mt-1 text-sm">{wir.description}</div>
          </div>
        )}

        {wir.review_comment && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <span className="font-semibold">{t("wir.reviewComment")}: </span>
            {wir.review_comment}
          </div>
        )}

        {wir.attachments.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-semibold text-slate-400">{t("wir.photos")}</div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {wir.attachments
                .filter((f) => f.mime.startsWith("image/"))
                .slice(0, 6)
                .map((f) => (
                  <img key={f.id} src={`/api/files/${f.id}`} alt={f.name} className="h-40 w-full rounded border border-slate-200 object-cover" />
                ))}
            </div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-sm">
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{wir.engineer_name ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.preparedBy")}</div>
            <div className="text-[10px] text-slate-400">{t("common.signatureNote")}</div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{wir.reviewer_name ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.reviewedLine")}</div>
            <div className="text-[10px] text-slate-400">
              {wir.reviewed_at ? formatDateTime(wir.reviewed_at, locale) : t("common.none")}
            </div>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1 font-semibold">{t(`wir.status${cap(wir.status)}`)}</div>
            <div className="mt-1 text-xs text-slate-500">{t("print.statusLine")}</div>
            <div className="text-[10px] text-slate-400">{t("print.electronicApproval")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
