"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { Button, Input, Select } from "@/components/ui/controls";
import { PageHeader, EmptyState, Card } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { formatDate, formatDateTime } from "@/server/i18n";

interface ReportRow {
  id: string;
  report_date: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  submitter_name: string | null;
  reviewer_name: string | null;
  activity_count: number;
  manpower_count: number;
}

export function DrList({
  projectId,
  locale,
  reports,
  canCreate,
  policy,
}: {
  projectId: string;
  locale: string;
  reports: ReportRow[];
  canCreate: boolean;
  policy: "none" | "manager";
}) {
  const { t } = useApp();
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(
    () =>
      reports.filter((r) => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (from && r.report_date < from) return false;
        if (to && r.report_date > to) return false;
        return true;
      }),
    [reports, statusFilter, from, to],
  );

  return (
    <div>
      <PageHeader
        title={t("dailyReport.title")}
        subtitle={policy === "none" ? t("dailyReport.finalPolicy") : t("dailyReport.managerApproval")}
        actions={
          canCreate ? (
            <Link href={`/projects/${projectId}/daily-reports/new`}>
              <Button>+ {t("dailyReport.new")}</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option>
          <option value="draft">{t("dailyReport.statusDraft")}</option>
          <option value="submitted">{t("dailyReport.statusSubmitted")}</option>
          <option value="approved">{t("dailyReport.statusApproved")}</option>
          <option value="rejected">{t("dailyReport.statusRejected")}</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <span className="text-xs text-slate-400">—</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("dailyReport.noReports")} />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link key={r.id} href={`/daily-reports/${r.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 py-3 transition-shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{formatDate(r.report_date, locale)}</span>
                    <StatusBadge kind="daily_report" status={r.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.activity_count} {t("dailyReport.activities")} · {r.manpower_count} {t("dailyReport.manpower")}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-end text-xs text-slate-500">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t("common.submittedBy")}</div>
                    <div>{r.submitter_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t("common.reviewedBy")}</div>
                    <div>{r.reviewer_name ?? "—"}</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-[10px] uppercase text-slate-400">{t("common.updated")}</div>
                    <div>{r.submitted_at ? formatDateTime(r.submitted_at, locale) : "—"}</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
