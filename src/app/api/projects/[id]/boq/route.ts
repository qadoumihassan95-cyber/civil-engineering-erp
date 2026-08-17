
import { api, ok } from "@/server/api/route";
import { listSections, listItemsWithQuantities } from "@/server/services/boq";

export const GET = api(async (_req, meta, params) => {
  const [sections, items] = await Promise.all([
    listSections(meta.ctx, params.id),
    listItemsWithQuantities(meta.ctx, params.id),
  ]);
  return ok({ sections, items });
});
