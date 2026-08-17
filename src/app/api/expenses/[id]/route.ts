
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import {
  getExpense,
  updateExpenseDraft,
  deleteExpenseDraft,
  submitExpense,
  decideExpense,
  expenseSchema,
} from "@/server/services/expenses";

export const GET = api(async (_req, meta, params) => {
  return ok(await getExpense(meta.ctx, params.id));
});

export const PATCH = api(
  async (req, meta, params) => {
    await updateExpenseDraft(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: expenseSchema, permission: "expense:create" },
);

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(4000).optional().nullable(),
});

export const POST = api(
  async (req, meta, params) => {
    const action = req.nextUrl.searchParams.get("action");
    const body = parsed<{ comment?: string | null }>(req) ?? {};
    if (action === "submit") {
      await submitExpense(meta.ctx, params.id, body.comment ?? null);
      return ok({ ok: true });
    }
    if (action === "approve" || action === "reject") {
      const data = decideSchema.parse({ decision: action === "approve" ? "approved" : "rejected", comment: body.comment ?? null });
      await decideExpense(meta.ctx, params.id, data);
      return ok({ ok: true });
    }
    return ok({ error: "Unknown action" }, { status: 400 });
  },
  { parse: z.object({ comment: z.string().max(4000).optional().nullable() }).optional(), permission: ["expense:create", "expense:approve"] },
);

export const DELETE = api(async (_req, meta, params) => {
  await deleteExpenseDraft(meta.ctx, params.id);
  return ok({ ok: true });
});
