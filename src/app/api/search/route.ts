
import { api, ok } from "@/server/api/route";
import { globalSearch } from "@/server/services/search";

export const GET = api(async (req, meta) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return ok(await globalSearch(meta.ctx, q));
});
