
import { api, ok, parsed } from "@/server/api/route";
import { updateSection, deleteSection, createSectionSchema } from "@/server/services/boq";

export const PATCH = api(
  async (req, meta, params) => {
    await updateSection(meta.ctx, params.id, params.sid, parsed(req));
    return ok({ ok: true });
  },
  { parse: createSectionSchema, permission: "boq:manage" },
);

export const DELETE = api(async (_req, meta, params) => {
  await deleteSection(meta.ctx, params.id, params.sid);
  return ok({ ok: true });
});
