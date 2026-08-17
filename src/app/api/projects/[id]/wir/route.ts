
import { api, ok, parsed } from "@/server/api/route";
import { listWirs, createWirDraft, createWirSchema } from "@/server/services/wir";

export const GET = api(async (req, meta, params) => {
  const sp = req.nextUrl.searchParams;
  const rows = await listWirs(meta.ctx, params.id, {
    status: sp.get("status") ?? undefined,
    search: sp.get("search") ?? undefined,
  });
  return ok(rows);
});

export const POST = api(
  async (req, meta, params) => {
    const result = await createWirDraft(meta.ctx, params.id, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: createWirSchema , permission: "wir:create"},
);
