
import { api, ok, parsed } from "@/server/api/route";
import { requireAnyPermission } from "@/server/auth/context";
import { listSuppliers, createSupplier, supplierSchema } from "@/server/services/inventory";

export const GET = api(async (req, meta) => {
  requireAnyPermission(meta.user, ["inventory:transact", "inventory:adjust", "financial:view"]);
  const sp = req.nextUrl.searchParams;
  return ok(await listSuppliers(meta.ctx, { search: sp.get("search") ?? undefined }));
});

export const POST = api(
  async (req, meta) => {
    const result = await createSupplier(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: supplierSchema , permission: "inventory:transact"},
);
