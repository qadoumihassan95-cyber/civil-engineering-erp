"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Dict } from "@/server/i18n/en";
import type { } from "@/server/i18n";

export type Locale = "en" | "ar";

interface AppContextValue {
  locale: Locale;
  dict: Dict;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
  api: {
    call: <T = unknown>(
      method: string,
      url: string,
      body?: unknown,
      opts?: { formData?: boolean },
    ) => Promise<T>;
  };
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

export function Providers({
  children,
  locale: initialLocale,
  dict: initialDict,
}: {
  children: React.ReactNode;
  locale: Locale;
  dict: Dict;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dict, setDict] = useState<Dict>(initialDict);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = lookup(dict, key) ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) value = value.replaceAll(`{${k}}`, String(v));
      }
      return value;
    },
    [dict],
  );

  const pushToast = useCallback((kind: ToastItem["kind"], message: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const toast = useMemo(
    () => ({
      success: (m: string) => pushToast("success", m),
      error: (m: string) => pushToast("error", m),
      info: (m: string) => pushToast("info", m),
    }),
    [pushToast],
  );

  const setLocale = useCallback(
    async (l: Locale) => {
      try {
        const res = await fetch("/api/auth/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("erp_csrf") ?? "" },
          body: JSON.stringify({ locale: l }),
        });
        if (res.ok) {
          document.cookie = `locale=${l}; path=/; max-age=31536000`;
          const data = await res.json();
          setLocaleState(l);
          const { dictionaries } = await import("@/server/i18n/index");
          setDict(dictionaries[l]);
          if (data.csrf) document.cookie = `erp_csrf=${data.csrf}; path=/; max-age=43200`;
          window.location.reload();
        }
      } catch {
        /* network error: keep current locale */
      }
    },
    [],
  );

  const api = useMemo(() => {
    async function call<T>(
      method: string,
      url: string,
      body?: unknown,
      _opts?: { formData?: boolean },
    ): Promise<T> {
      let csrf = readCookie("erp_csrf") ?? "";
      if (!csrf && method !== "GET") {
        try {
          const me = await fetch("/api/auth/me").then((r) => r.json());
          if (me.csrf) csrf = me.csrf;
        } catch {
          /* ignore */
        }
      }
      const headers: Record<string, string> = { "x-csrf-token": csrf };
      let payload: BodyInit | undefined;
      if (body instanceof FormData) {
        payload = body;
      } else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      let res = await fetch(url, { method, headers, body: payload });
      if (res.status === 403) {
        try {
          const me = await fetch("/api/auth/me").then((r) => r.json());
          if (me.csrf) {
            headers["x-csrf-token"] = me.csrf;
            res = await fetch(url, { method, headers, body: payload });
          }
        } catch {
          /* keep original response */
        }
      }
      if (res.status === 401) {
        window.location.href = "/login";
        throw new Error("unauthorized");
      }
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        const err = new Error(
          (data && typeof data === "object" && "error" in (data as object)
            ? (data as { error: string }).error
            : "Request failed") as string,
        ) as Error & { code?: string; i18nKey?: string; params?: Record<string, string | number> };
        if (data && typeof data === "object") {
          err.code = (data as { code?: string }).code;
          err.i18nKey = (data as { i18nKey?: string }).i18nKey;
          err.params = (data as { params?: Record<string, string | number> }).params;
        }
        throw err;
      }
      return data as T;
    }
    return { call };
  }, []);

  const value = useMemo(
    () => ({ locale, dict, t, setLocale, api, toast }),
    [locale, dict, t, setLocale, api, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="no-print fixed bottom-4 z-[100] flex flex-col gap-2 ltr:right-4 rtl:left-4 max-w-sm" role="status">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`animate-fade-in rounded-lg px-4 py-3 text-sm shadow-lg text-white ${
              item.kind === "success" ? "bg-emerald-600" : item.kind === "error" ? "bg-rose-600" : "bg-slate-800"
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within Providers");
  return ctx;
}

export function useT() {
  return useApp().t;
}

export function useLocale() {
  return { locale: useApp().locale, setLocale: useApp().setLocale };
}

export function useToast() {
  return useApp().toast;
}

export function useApi() {
  return useApp().api;
}

export { readCookie };
