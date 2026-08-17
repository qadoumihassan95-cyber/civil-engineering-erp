
import { api, ok, parsed } from "@/server/api/route";
import {
  getWir,
  updateWirDraft,
  deleteWirDraft,
  findWirProject,
  updateWirSchema,
} from "@/server/services/wir";

export const GET = api(async (_req, meta, params) => {
  const projectId = await findWirProject(meta.ctx, params.id);
  const wir = await getWir(meta.ctx, projectId, params.id);
  return ok(wir);
});

export const PATCH = api(
  async (req, meta, params) => {
    const projectId = await findWirProject(meta.ctx, params.id);
    await updateWirDraft(meta.ctx, projectId, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: updateWirSchema, permission: ["wir:create", "wir:approve"] },
);

export const DELETE = api(async (_req, meta, params) => {
  const projectId = await findWirProject(meta.ctx, params.id);
  await deleteWirDraft(meta.ctx, projectId, params.id);
  return ok({ ok: true });
});
