import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { getDict, type Dict } from "@/server/i18n";
import { Providers } from "@/components/providers";
import { inter, kufi } from "./fonts";

export const metadata: Metadata = {
  title: "CivilERP — Construction Project Control",
  description: "Civil engineering ERP: projects, BOQ, WIR, daily reports, inventory, expenses and project controls.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const dict: Dict = getDict(locale);
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${inter.variable} ${kufi.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers locale={locale} dict={dict}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
