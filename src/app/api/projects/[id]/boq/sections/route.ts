
import { api, ok, parsed } from "@/server/api/route";
import { createSection, createSectionSchema } from "@/server/services/boq";

export const POST = api(
  async (req, meta, params) => {
    const result = await createSection(meta.ctx, params.id, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: createSectionSchema , permission: "boq:manage"},
);
