"use client";

import Link from "next/link";
import { useApp } from "@/components/providers";

export default function NotFound() {
  const { t } = useApp();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl font-bold text-slate-200">404</div>
      <h2 className="mt-3 text-lg font-bold text-slate-800">{t("errors.notFound")}</h2>
      <Link href="/" className="mt-5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
        {t("nav.dashboard")}
      </Link>
    </div>
  );
}
