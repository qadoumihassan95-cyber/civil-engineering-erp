"use client";

import { useApp } from "@/components/providers";

export function PrintButton() {
  const { t } = useApp();
  return (
    <button
      onClick={() => window.print()}
      className="no-print fixed bottom-6 end-6 z-50 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-primary-700"
    >
      🖨 {t("common.print")}
    </button>
  );
}
