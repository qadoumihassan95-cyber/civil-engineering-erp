
import { api, ok, parsed } from "@/server/api/route";
import {
  updateItem,
  deleteItem,
  updateItemSchema,
} from "@/server/services/boq";

export const PATCH = api(
  async (req, meta, params) => {
    await updateItem(meta.ctx, params.id, params.iid, parsed(req));
    return ok({ ok: true });
  },
  { parse: updateItemSchema, permission: "boq:manage" },
);

export const DELETE = api(async (_req, meta, params) => {
  await deleteItem(meta.ctx, params.id, params.iid);
  return ok({ ok: true });
});
