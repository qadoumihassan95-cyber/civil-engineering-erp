
import { api, ok, parsed } from "@/server/api/route";
import { updateMaterial, updateMaterialSchema } from "@/server/services/inventory";

export const PATCH = api(
  async (req, meta, params) => {
    await updateMaterial(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: updateMaterialSchema , permission: "inventory:transact"},
);
