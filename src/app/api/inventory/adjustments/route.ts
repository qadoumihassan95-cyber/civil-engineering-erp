
import { api, ok, parsed } from "@/server/api/route";
import { listAdjustments, createAdjustment, adjustmentSchema } from "@/server/services/adjustments";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  return ok(
    await listAdjustments(meta.ctx, {
      status: sp.get("status") ?? undefined,
      page: Number(sp.get("page") ?? 1),
      pageSize: Number(sp.get("page_size") ?? 25),
    }),
  );
});

export const POST = api(
  async (req, meta) => {
    const result = await createAdjustment(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: adjustmentSchema , permission: "inventory:adjust"},
);
