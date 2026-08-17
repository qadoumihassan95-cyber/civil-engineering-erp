import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listExpenses, listExpenseCategories } from "@/server/services/expenses";
import { listVisibleProjects } from "@/server/services/projects";
import { listSuppliers } from "@/server/services/inventory";
import { getAuthUser } from "@/server/auth/context";
import { hasPermission } from "@/server/auth/rbac";
import { getT } from "@/server/i18n";
import { ExpensesView } from "@/components/expenses/expenses-view";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ project_id?: string; status?: string; open?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const _t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [data, categories, projects, suppliers] = await Promise.all([
    listExpenses(ctx, {
      projectId: sp.project_id,
      status: sp.status,
      page: Number(sp.page ?? 1),
      pageSize: 25,
    }),
    listExpenseCategories(ctx),
    listVisibleProjects(ctx),
    listSuppliers(ctx),
  ]);
  return (
    <ExpensesView
      locale={locale}
      initial={data as never}
      categories={categories}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      canCreate={hasPermission(user.role, "expense:create")}
      canApprove={hasPermission(user.role, "expense:approve")}
      canExport={hasPermission(user.role, "export:use")}
      openId={sp.open ?? null}
    />
  );
}
