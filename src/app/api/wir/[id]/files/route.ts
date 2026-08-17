
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { attachWirFiles, removeWirFile, findWirProject } from "@/server/services/wir";
import { requireProjectPermission } from "@/server/auth/context";

const attachSchema = z.object({ file_ids: z.array(z.string().uuid()).min(1) });
const removeSchema = z.object({ file_id: z.string().uuid() });

export const POST = api(
  async (req, meta, params) => {
    const projectId = await findWirProject(meta.ctx, params.id);
    await requireProjectPermission(meta.user, projectId, "wir:create");
    await attachWirFiles(meta.ctx, params.id, parsed<{ file_ids: string[] }>(req).file_ids);
    return ok({ ok: true });
  },
  { parse: attachSchema },
);

export const DELETE = api(
  async (req, meta, params) => {
    const projectId = await findWirProject(meta.ctx, params.id);
    await removeWirFile(meta.ctx, projectId, params.id, parsed<{ file_id: string }>(req).file_id);
    return ok({ ok: true });
  },
  { parse: removeSchema , permission: "wir:create"},
);
