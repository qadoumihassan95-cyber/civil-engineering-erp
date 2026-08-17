
import { api, ok, parsed } from "@/server/api/route";
import { listTransfers, createTransfer, transferSchema } from "@/server/services/movements";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  return ok(
    await listTransfers(meta.ctx, {
      status: sp.get("status") ?? undefined,
      page: Number(sp.get("page") ?? 1),
      pageSize: Number(sp.get("page_size") ?? 25),
    }),
  );
});

export const POST = api(
  async (req, meta) => {
    const result = await createTransfer(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: transferSchema , permission: "inventory:transact"},
);
