
import { api, ok } from "@/server/api/route";
import { deleteDocument } from "@/server/services/documents";

export const DELETE = api(async (_req, meta, params) => {
  await deleteDocument(meta.ctx, params.id);
  return ok({ ok: true });
});
