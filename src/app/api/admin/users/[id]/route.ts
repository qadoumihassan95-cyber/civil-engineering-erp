
import { api, ok, parsed } from "@/server/api/route";
import { getUser, updateUser, updateUserSchema } from "@/server/services/users";

export const GET = api(async (_req, meta, params) => {
  return ok(await getUser(meta.ctx, params.id));
});

export const PATCH = api(
  async (req, meta, params) => {
    await updateUser(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: updateUserSchema , permission: "user:manage"},
);
