import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/server/auth/context";
import { getT } from "@/server/i18n";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  return (
    <AppShell
      user={user}
      navLabels={{
        dashboard: t("nav.dashboard"),
        projects: t("nav.projects"),
        inventory: t("nav.inventory"),
        stock: t("nav.stock"),
        receipts: t("nav.receipts"),
        issues: t("nav.issues"),
        transfers: t("nav.transfers"),
        returns: t("nav.returns"),
        adjustments: t("nav.adjustments"),
        materials: t("nav.materials"),
        suppliers: t("nav.suppliers"),
        warehouses: t("nav.warehouses"),
        expenses: t("nav.expenses"),
        documents: t("nav.documents"),
        reports: t("nav.reports"),
        admin: t("nav.admin"),
        users: t("nav.users"),
        audit: t("nav.audit"),
        searchPlaceholder: t("search.placeholder"),
        logout: t("common.logout"),
        language: t("common.language"),
        menu: t("common.menu"),
      }}
    >
      {children}
    </AppShell>
  );
}
