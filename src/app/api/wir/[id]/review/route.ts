
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { startWirReview, findWirProject } from "@/server/services/wir";

const actionSchema = z.object({ comment: z.string().max(4000).optional().nullable() });

export const POST = api(
  async (req, meta, params) => {
    const projectId = await findWirProject(meta.ctx, params.id);
    await startWirReview(meta.ctx, projectId, params.id, parsed<{ comment?: string | null }>(req).comment ?? null);
    return ok({ ok: true });
  },
  { parse: actionSchema , permission: "wir:review"},
);
