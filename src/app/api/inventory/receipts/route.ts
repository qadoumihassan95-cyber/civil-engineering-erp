
import { api, ok, parsed } from "@/server/api/route";
import { listReceipts, createReceipt, receiptSchema } from "@/server/services/movements";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  return ok(
    await listReceipts(meta.ctx, {
      status: sp.get("status") ?? undefined,
      page: Number(sp.get("page") ?? 1),
      pageSize: Number(sp.get("page_size") ?? 25),
    }),
  );
});

export const POST = api(
  async (req, meta) => {
    const result = await createReceipt(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: receiptSchema , permission: "inventory:transact"},
);
