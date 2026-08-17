
import { api, ok, parsed } from "@/server/api/route";
import { listUsers, createUser, createUserSchema } from "@/server/services/users";

export const GET = api(async (_req, meta) => {
  return ok(await listUsers(meta.ctx));
});

export const POST = api(
  async (req, meta) => {
    const result = await createUser(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: createUserSchema , permission: "user:manage"},
);
