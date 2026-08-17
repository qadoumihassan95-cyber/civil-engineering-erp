
import { api, ok } from "@/server/api/route";
import { listDocuments } from "@/server/services/documents";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  return ok(
    await listDocuments(meta.ctx, {
      projectId: sp.get("project_id") ?? undefined,
      kind: sp.get("kind") ?? undefined,
      search: sp.get("search") ?? undefined,
      page: Number(sp.get("page") ?? 1),
      pageSize: Number(sp.get("page_size") ?? 30),
    }),
  );
});
