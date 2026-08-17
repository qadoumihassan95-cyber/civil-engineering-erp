"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({
  projectId,
  labels,
}: {
  projectId: string;
  labels: Record<string, string>;
}) {
  const pathname = usePathname();
  const tabs = [
    { key: "overview", href: `/projects/${projectId}`, label: labels.overview, exact: true },
    { key: "boq", href: `/projects/${projectId}/boq`, label: labels.boq },
    { key: "wir", href: `/projects/${projectId}/wir`, label: labels.wir },
    { key: "dr", href: `/projects/${projectId}/daily-reports`, label: labels.dailyReports },
    { key: "inventory", href: `/projects/${projectId}/inventory`, label: labels.inventory },
    { key: "expenses", href: `/projects/${projectId}/expenses`, label: labels.expenses },
    { key: "documents", href: `/projects/${projectId}/documents`, label: labels.documents },
    { key: "controls", href: `/projects/${projectId}/controls`, label: labels.controls },
    { key: "settings", href: `/projects/${projectId}/settings`, label: labels.settings },
  ];
  return (
    <div className="no-print -mb-px flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
