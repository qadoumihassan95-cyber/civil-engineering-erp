
import { api, ok, parsed } from "@/server/api/route";
import { requireAnyPermission } from "@/server/auth/context";
import { listWarehouses, createWarehouse, warehouseSchema } from "@/server/services/inventory";

export const GET = api(async (_req, meta) => {
  requireAnyPermission(meta.user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  return ok(await listWarehouses(meta.ctx));
});

export const POST = api(
  async (req, meta) => {
    const result = await createWarehouse(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: warehouseSchema , permission: "inventory:transact"},
);
