"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Field, Textarea, Badge } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Card, CardHeader, KV, EmptyState } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { formatNumber, formatDateTime } from "@/server/i18n";

interface ReportData {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  report_date: string;
  weather: Record<string, unknown>;
  site_conditions: string | null;
  notes: string | null;
  status: string;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  submitter_name: string | null;
  reviewer_name: string | null;
  manpower: { id: string; labor_type: string; count: number }[];
  subcontractors: { id: string; name: string; crew_count: number | null; work_done: string | null }[];
  equipment: { id: string; name: string; hours: string | null; notes: string | null }[];
  activities: { id: string; boq_item_id: string | null; description: string; qty: string; unit: string | null; location: string | null; item_code: string | null }[];
  materials_received: { id: string; name: string; qty: string; unit: string | null; supplier: string | null }[];
  materials_consumed: { id: string; name: string; qty: string; unit: string | null; source: string | null }[];
  delays: { id: string; description: string; duration_hours: string | null; party: string | null }[];
  incidents: { id: string; description: string; severity: string | null; action_taken: string | null }[];
  safety: { id: string; observation: string; action: string | null }[];
  visitors: { id: string; name: string; organization: string | null; purpose: string | null }[];
  events: { id: string; from_status: string | null; to_status: string; actor_name: string; comment: string | null; created_at: string }[];
  attachments: { id: string; name: string; mime: string; size: number }[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      {children}
    </Card>
  );
}

function List({ rows }: { rows: React.ReactNode[] }) {
  if (!rows.length) return <EmptyState title="—" />;
  return <div className="divide-y divide-slate-100">{rows.map((r, i) => <div key={i} className="py-2 text-sm text-slate-700">{r}</div>)}</div>;
}

export function DrDetail({
  report,
  projectId,
  locale,
  policy,
  perms,
}: {
  report: ReportData;
  projectId: string;
  locale: string;
  policy: "none" | "manager";
  perms: { create: boolean; approve: boolean };
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = (report.status === "draft" || report.status === "rejected") && perms.create;
  const canSubmit = (report.status === "draft" || report.status === "rejected") && perms.create;
  const canApprove = report.status === "submitted" && policy === "manager" && perms.approve && (report.submitted_by !== null);
  const canDelete = report.status === "draft" && perms.create;
  const sepOk = canApprove && report.submitted_by !== null;

  const fmt = (v: string) => formatNumber(v, locale);
  const weather = (report.weather ?? {}) as { condition?: string; temp_min?: number | null; temp_max?: number | null; wind?: string };

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  async function action(url: string, body?: unknown, msg?: string) {
    setBusy(true);
    try {
      await api.call("POST", url, body ?? {});
      toast.success(msg ?? t("common.saved"));
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/projects/${projectId}/daily-reports`} className="text-sm text-slate-500 hover:text-primary-600">
          ← {t("common.back")}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/daily-report/${report.id}`, "_blank")}>
            {t("common.print")}
          </Button>
          {canEdit && (
            <Link href={`/daily-reports/${report.id}/edit`}>
              <Button variant="outline" size="sm">{t("common.edit")}</Button>
            </Link>
          )}
          {canSubmit && (
            <Button size="sm" onClick={() => action(`/api/daily-reports/${report.id}/submit`, {}, t("common.submittedMsg"))}>
              {policy === "none" ? t("dailyReport.submitFinal") : t("dailyReport.submit")}
            </Button>
          )}
          {sepOk && (
            <>
              <Button size="sm" variant="success" onClick={() => action(`/api/daily-reports/${report.id}/decide`, { decision: "approved" }, t("common.approvedMsg"))}>
                {t("common.approve")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => { setComment(""); setRejectOpen(true); }}>
                {t("common.reject")}
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className="print-area mb-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-bold tracking-wider text-primary-600">{t("print.dailyReportTitle").toUpperCase()}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{report.report_date}</div>
            <div className="mt-1 text-xs text-slate-500">{report.project_code} — {report.project_name}</div>
          </div>
          <StatusBadge kind="daily_report" status={report.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KV label={t("dailyReport.weatherCondition")}>
            {weather.condition ? t(`dailyReport.${weather.condition}`) : "—"}
          </KV>
          <KV label={t("dailyReport.tempMin")}>{weather.temp_min != null ? `${weather.temp_min}°C` : "—"}</KV>
          <KV label={t("dailyReport.tempMax")}>{weather.temp_max != null ? `${weather.temp_max}°C` : "—"}</KV>
          <KV label={t("common.submittedBy")}>{report.submitter_name ?? "—"}</KV>
          <KV label={t("common.reviewedBy")}>{report.reviewer_name ?? "—"}</KV>
        </div>
        {report.site_conditions && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{report.site_conditions}</div>
        )}
        {report.review_comment && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">{t("common.comment")}: </span>
            {report.review_comment}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title={t("dailyReport.manpower")}>
          <List
            rows={report.manpower.map(
              (m) => (
                <div key={m.id} className="flex justify-between">
                  <span>{m.labor_type}</span>
                  <span className="font-semibold">{m.count}</span>
                </div>
              ),
            )}
          />
        </Section>

        <Section title={t("dailyReport.subcontractors")}>
          <List
            rows={report.subcontractors.map((s) => (
              <div key={s.id}>
                <div className="flex justify-between">
                  <span className="font-semibold">{s.name}</span>
                  {s.crew_count != null && <span>{s.crew_count}</span>}
                </div>
                {s.work_done && <div className="text-xs text-slate-500">{s.work_done}</div>}
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.equipment")}>
          <List
            rows={report.equipment.map((e) => (
              <div key={e.id} className="flex justify-between">
                <span>{e.name}</span>
                <span className="font-mono">{e.hours ? `${e.hours} ${t("units.hour")}` : ""}</span>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.activities")}>
          <List
            rows={report.activities.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {a.item_code && <span className="me-1.5 rounded bg-primary-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-700">{a.item_code}</span>}
                  <span>{a.description}</span>
                  {a.location && <div className="text-xs text-slate-400">{a.location}</div>}
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold">
                  {fmt(a.qty)} {a.unit ?? ""}
                </span>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.materialsReceived")}>
          <List
            rows={report.materials_received.map((m) => (
              <div key={m.id} className="flex justify-between">
                <span>{m.name}{m.supplier ? ` — ${m.supplier}` : ""}</span>
                <span className="font-mono">{fmt(m.qty)} {m.unit ?? ""}</span>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.materialsConsumed")}>
          <List
            rows={report.materials_consumed.map((m) => (
              <div key={m.id} className="flex justify-between">
                <span>{m.name}{m.source ? ` — ${m.source}` : ""}</span>
                <span className="font-mono">{fmt(m.qty)} {m.unit ?? ""}</span>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.delays")}>
          <List
            rows={report.delays.map((d) => (
              <div key={d.id}>
                <div>{d.description}</div>
                <div className="text-xs text-slate-400">
                  {d.duration_hours ? `${d.duration_hours} h` : ""}{d.party ? ` · ${d.party}` : ""}
                </div>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.incidents")}>
          <List
            rows={report.incidents.map((i) => (
              <div key={i.id}>
                <div className="flex items-center gap-2">
                  {i.severity && (
                    <Badge tone={i.severity === "major" ? "red" : i.severity === "moderate" ? "amber" : "slate"}>
                      {t(`dailyReport.severity${cap(i.severity)}`)}
                    </Badge>
                  )}
                  <span>{i.description}</span>
                </div>
                {i.action_taken && <div className="text-xs text-slate-500">{i.action_taken}</div>}
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.safety")}>
          <List
            rows={report.safety.map((s) => (
              <div key={s.id}>
                <div>{s.observation}</div>
                {s.action && <div className="text-xs text-slate-500">{s.action}</div>}
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.visitors")}>
          <List
            rows={report.visitors.map((v) => (
              <div key={v.id}>
                <div className="font-semibold">{v.name}</div>
                <div className="text-xs text-slate-500">
                  {v.organization ? `${v.organization} · ` : ""}{v.purpose ?? ""}
                </div>
              </div>
            ))}
          />
        </Section>

        <Section title={t("dailyReport.photos")}>
          {report.attachments.length === 0 ? (
            <EmptyState title={t("common.emptyState")} />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {report.attachments.map((f) =>
                f.mime.startsWith("image/") ? (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                    <img src={`/api/files/${f.id}`} alt={f.name} className="h-24 w-full rounded object-cover" />
                  </a>
                ) : (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex h-24 items-center justify-center rounded bg-slate-50 text-xs">
                    {f.name}
                  </a>
                ),
              )}
            </div>
          )}
        </Section>

        <Section title={t("wir.timeline")}>
          <List
            rows={report.events.map((ev) => (
              <div key={ev.id}>
                <span className="font-semibold">{ev.actor_name}</span>
                <span className="mx-2 text-xs text-slate-400">{formatDateTime(ev.created_at, locale)}</span>
                <Badge tone="slate">{t(`dailyReport.status${cap(ev.to_status)}`)}</Badge>
                {ev.comment && <div className="mt-1 text-xs text-slate-500">{ev.comment}</div>}
              </div>
            ))}
          />
        </Section>
      </div>

      <div className="no-print mt-4 text-center text-[11px] text-slate-400">
        {t("print.electronicApproval")}
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t("common.reject")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={busy} onClick={() => { setRejectOpen(false); action(`/api/daily-reports/${report.id}/decide`, { decision: "rejected", comment }, t("common.rejectedMsg")); }}>
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <Field label={t("common.comment")} required>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.call("DELETE", `/api/daily-reports/${report.id}`);
            toast.success(t("common.deletedMsg"));
            router.push(`/projects/${projectId}/daily-reports`);
          } catch (e) {
            toast.error(errMsg(e));
          } finally {
            setBusy(false);
            setConfirmDelete(false);
          }
        }}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
