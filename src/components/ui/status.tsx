"use client";

import { Badge } from "./controls";
import { useT } from "@/components/providers";

type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet" | "cyan" | "gray";

const MAPS: Record<string, Record<string, { key: string; tone: Tone; dot?: string }>> = {
  wir: {
    draft: { key: "wir.statusDraft", tone: "slate" },
    submitted: { key: "wir.statusSubmitted", tone: "blue" },
    under_review: { key: "wir.statusUnderReview", tone: "amber" },
    approved: { key: "wir.statusApproved", tone: "green" },
    approved_with_comments: { key: "wir.statusApprovedWithComments", tone: "cyan" },
    returned: { key: "wir.statusReturned", tone: "violet" },
    rejected: { key: "wir.statusRejected", tone: "red" },
  },
  daily_report: {
    draft: { key: "dailyReport.statusDraft", tone: "slate" },
    submitted: { key: "dailyReport.statusSubmitted", tone: "blue" },
    approved: { key: "dailyReport.statusApproved", tone: "green" },
    rejected: { key: "dailyReport.statusRejected", tone: "red" },
  },
  expense: {
    draft: { key: "expenses.statusDraft", tone: "slate" },
    submitted: { key: "expenses.statusSubmitted", tone: "blue" },
    approved: { key: "expenses.statusApproved", tone: "green" },
    rejected: { key: "expenses.statusRejected", tone: "red" },
  },
  project: {
    planning: { key: "projects.statusPlanning", tone: "slate" },
    active: { key: "projects.statusActive", tone: "green" },
    on_hold: { key: "projects.statusOnHold", tone: "amber" },
    completed: { key: "projects.statusCompleted", tone: "blue" },
    cancelled: { key: "projects.statusCancelled", tone: "red" },
  },
  posting: {
    draft: { key: "inventory.statusDraft", tone: "slate" },
    posted: { key: "inventory.statusPosted", tone: "green" },
    void: { key: "inventory.statusVoid", tone: "gray" },
  },
  adjustment: {
    draft: { key: "inventory.statusDraft", tone: "slate" },
    submitted: { key: "dailyReport.statusSubmitted", tone: "blue" },
    approved: { key: "dailyReport.statusApproved", tone: "green" },
    rejected: { key: "dailyReport.statusRejected", tone: "red" },
    posted: { key: "inventory.statusPosted", tone: "violet" },
  },
};

export function StatusBadge({ kind, status }: { kind: keyof typeof MAPS; status: string }) {
  const t = useT();
  const entry = MAPS[kind]?.[status];
  if (!entry) return <Badge tone="slate">{status}</Badge>;
  return <Badge tone={entry.tone}>{t(entry.key)}</Badge>;
}
