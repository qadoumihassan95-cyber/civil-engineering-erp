
import { api, ok, parsed } from "@/server/api/route";
import { requireAnyPermission } from "@/server/auth/context";
import {
  listMaterials,
  createMaterial,
  materialSchema,
  listCategories,
} from "@/server/services/inventory";

export const GET = api(async (req, meta) => {
  requireAnyPermission(meta.user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const sp = req.nextUrl.searchParams;
  const rows = await listMaterials(meta.ctx, {
    search: sp.get("search") ?? undefined,
    categoryId: sp.get("category_id") ?? undefined,
  });
  const categories = await listCategories(meta.ctx);
  return ok({ materials: rows, categories });
});

export const POST = api(
  async (req, meta) => {
    const result = await createMaterial(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: materialSchema , permission: "inventory:transact"},
);
