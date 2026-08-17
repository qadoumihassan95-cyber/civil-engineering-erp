import { en, type Dict } from "./en";
import { ar } from "./ar";

export type Locale = "en" | "ar";

export const dictionaries: Record<Locale, Dict> = { en, ar };

export const LOCALES: Locale[] = ["en", "ar"];

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

export function getDict(locale: string): Dict {
  return dictionaries[locale === "ar" ? "ar" : "en"];
}

type Paths<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends readonly unknown[]
          ? never
          : T[K] extends object
            ? `${K}.${Paths<T[K]>}`
            : K
        : never;
    }[keyof T]
  : never;

export type TranslationKey = Paths<Dict>;

function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function t(
  locale: Locale | string,
  key: TranslationKey | string,
  params?: Record<string, string | number>,
): string {
  const dict = getDict(locale);
  let value = lookup(dict, key) ?? lookup(en, key) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

export type TFunction = (key: TranslationKey | string, params?: Record<string, string | number>) => string;

export function getT(locale: Locale | string): TFunction {
  return (key, params) => t(locale, key, params);
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(
  value: string | number | null | undefined,
  locale: string,
  opts: Intl.NumberFormatOptions = {},
): string {
  const loc = locale === "ar" ? "ar-JO" : "en-JO";
  const cacheKey = loc + JSON.stringify(opts);
  let fmt = numberFormatters.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, { maximumFractionDigits: 4, ...opts });
    numberFormatters.set(cacheKey, fmt);
  }
  const v = value === null || value === undefined || value === "" ? 0 : Number(value);
  if (Number.isNaN(v)) return "—";
  return fmt.format(v);
}

export function formatMoney(value: string | number | null | undefined, locale: string): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function unitLabel(unit: string, locale: string): string {
  const u = getDict(locale).units as Record<string, string>;
  return u[unit] ?? unit;
}

export function translateUnit(unit: string, locale: string): string {
  return unitLabel(unit, locale);
}

export { en, ar };
export type { Dict };
