"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, useLocale } from "@/components/providers";
import { Button, Input, Field } from "@/components/ui/controls";

export default function LoginPage() {
  const { t, api } = useApp();
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.call<{ csrf: string }>("POST", "/api/auth/login", { email, password });
      if (res.csrf) document.cookie = `erp_csrf=${res.csrf}; path=/; max-age=43200`;
      router.push(params.get("next") ?? "/");
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      setError(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <button
        onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        className="absolute end-4 top-4 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50"
      >
        {locale === "ar" ? "English" : "العربية"}
      </button>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-700 text-white shadow-md">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l7-4 7 4v14" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("auth.signInSubtitle")}</p>
        </div>
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">{t("auth.signInTitle")}</h2>
          {error && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <Field label={t("auth.email")} className="mb-4">
            <Input
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
            />
          </Field>
          <Field label={t("auth.password")} className="mb-5">
            <Input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {t("auth.signIn")}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          {t("print.electronicApproval")}
        </p>
      </div>
    </div>
  );
}
