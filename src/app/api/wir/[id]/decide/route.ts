
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { decideWir, findWirProject } from "@/server/services/wir";

const decideSchema = z.object({
  decision: z.enum(["approved", "approved_with_comments", "returned", "rejected"]),
  comment: z.string().max(4000).optional().nullable(),
  approved_qty: z.string().regex(/^\d+(\.\d{1,4})?$/).optional().nullable(),
});

export const POST = api(
  async (req, meta, params) => {
    const projectId = await findWirProject(meta.ctx, params.id);
    await decideWir(meta.ctx, projectId, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: decideSchema , permission: "wir:approve"},
);
