"use client";

import { useEffect } from "react";
import { useApp } from "@/components/providers";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useApp();
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error.message.includes("permission") || error.message.includes("access")
    ? t("errors.forbidden")
    : t("errors.generic");

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl font-bold text-slate-300">!</div>
      <h2 className="mt-3 text-lg font-bold text-slate-800">{message}</h2>
      <p className="mt-1 text-sm text-slate-500">{error.message}</p>
      <button
        onClick={reset}
        className="mt-5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
      >
        {t("common.refresh")}
      </button>
    </div>
  );
}
