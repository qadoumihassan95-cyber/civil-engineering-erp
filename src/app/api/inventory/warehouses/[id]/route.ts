
import { api, ok, parsed } from "@/server/api/route";
import { updateWarehouse, warehouseSchema } from "@/server/services/inventory";

export const PATCH = api(
  async (req, meta, params) => {
    await updateWarehouse(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: warehouseSchema , permission: "inventory:transact"},
);
