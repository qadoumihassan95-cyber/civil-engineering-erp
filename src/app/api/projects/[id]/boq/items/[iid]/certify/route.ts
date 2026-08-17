
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { setCertifiedQty } from "@/server/services/boq";

const certifySchema = z.object({ certified_qty: z.string().regex(/^\d+(\.\d{1,4})?$/) });

export const POST = api(
  async (req, meta, params) => {
    await setCertifiedQty(meta.ctx, params.id, params.iid, parsed<{ certified_qty: string }>(req).certified_qty);
    return ok({ ok: true });
  },
  { parse: certifySchema , permission: "boq:certify"},
);
