
import { api, ok, parsed } from "@/server/api/route";
import {
  listExpenses,
  createExpense,
  expenseSchema,
  listExpenseCategories,
} from "@/server/services/expenses";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  const result = await listExpenses(meta.ctx, {
    projectId: sp.get("project_id") ?? undefined,
    status: sp.get("status") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    search: sp.get("search") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("page_size") ?? 25),
  });
  const categories = await listExpenseCategories(meta.ctx);
  return ok({ ...result, categories });
});

export const POST = api(
  async (req, meta) => {
    const result = await createExpense(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: expenseSchema , permission: "expense:create"},
);
