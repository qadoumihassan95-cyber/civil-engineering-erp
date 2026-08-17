
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import {
  getAdjustment,
  submitAdjustment,
  approveAdjustment,
  postAdjustment,
  deleteAdjustmentDraft,
} from "@/server/services/adjustments";

export const GET = api(async (_req, meta, params) => {
  return ok(await getAdjustment(meta.ctx, params.id));
});

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(4000).optional().nullable(),
});

export const POST = api(
  async (req, meta, params) => {
    const action = req.nextUrl.searchParams.get("action");
    const body = parsed<{ comment?: string | null }>(req) ?? {};
    if (action === "submit") {
      await submitAdjustment(meta.ctx, params.id);
      return ok({ ok: true });
    }
    if (action === "approve" || action === "reject") {
      const data = decideSchema.parse({
        decision: action === "approve" ? "approved" : "rejected",
        comment: body.comment ?? null,
      });
      await approveAdjustment(meta.ctx, params.id, data);
      return ok({ ok: true });
    }
    if (action === "post") {
      await postAdjustment(meta.ctx, params.id);
      return ok({ ok: true });
    }
    if (action === "delete") {
      await deleteAdjustmentDraft(meta.ctx, params.id);
      return ok({ ok: true });
    }
    return ok({ error: "Unknown action" }, { status: 400 });
  },
  { parse: z.object({ comment: z.string().max(4000).optional().nullable() }).optional() , permission: ["inventory:adjust", "financial:view"]},
);
