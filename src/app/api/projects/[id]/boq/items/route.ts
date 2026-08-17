
import { api, ok, parsed } from "@/server/api/route";
import { createItem, createItemSchema } from "@/server/services/boq";

export const POST = api(
  async (req, meta, params) => {
    const result = await createItem(meta.ctx, params.id, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: createItemSchema , permission: "boq:manage"},
);
