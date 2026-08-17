
import { api, ok } from "@/server/api/route";
import { getReceipt, postReceipt, deleteDraftReceipt } from "@/server/services/movements";

export const GET = api(async (_req, meta, params) => {
  return ok(await getReceipt(meta.ctx, params.id));
});

export const POST = api(async (_req, meta, params) => {
  const action = _req.nextUrl.searchParams.get("action");
  if (action === "post") {
    await postReceipt(meta.ctx, params.id);
    return ok({ ok: true });
  }
  if (action === "delete") {
    await deleteDraftReceipt(meta.ctx, params.id);
    return ok({ ok: true });
  }
  throw new Error("Unknown action");
});
