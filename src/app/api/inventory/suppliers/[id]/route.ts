
import { api, ok, parsed } from "@/server/api/route";
import { updateSupplier, supplierSchema } from "@/server/services/inventory";

export const PATCH = api(
  async (req, meta, params) => {
    await updateSupplier(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: supplierSchema , permission: "inventory:transact"},
);
