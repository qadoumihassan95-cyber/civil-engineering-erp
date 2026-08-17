
import { api, ok, parsed } from "@/server/api/route";
import { applyVariation, variationSchema } from "@/server/services/boq";

export const POST = api(
  async (req, meta, params) => {
    await applyVariation(meta.ctx, params.id, params.iid, parsed(req));
    return ok({ ok: true });
  },
  { parse: variationSchema , permission: "boq:manage"},
);
