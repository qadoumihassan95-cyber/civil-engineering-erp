
import { api, ok } from "@/server/api/route";
import { getIssue, postIssue, deleteDraftIssue } from "@/server/services/movements";

export const GET = api(async (_req, meta, params) => {
  return ok(await getIssue(meta.ctx, params.id));
});

export const POST = api(async (req, meta, params) => {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "post") {
    await postIssue(meta.ctx, params.id);
    return ok({ ok: true });
  }
  if (action === "delete") {
    await deleteDraftIssue(meta.ctx, params.id);
    return ok({ ok: true });
  }
  throw new Error("Unknown action");
});
