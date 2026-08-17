
import { api, ok, parsed } from "@/server/api/route";
import { listCategories, createCategory, categorySchema } from "@/server/services/inventory";

export const GET = api(async (_req, meta) => {
  return ok(await listCategories(meta.ctx));
});

export const POST = api(
  async (req, meta) => {
    const result = await createCategory(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: categorySchema , permission: "inventory:transact"},
);
