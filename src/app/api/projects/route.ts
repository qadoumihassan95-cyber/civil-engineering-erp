
import { api, ok, parsed } from "@/server/api/route";
import {
  listVisibleProjects,
  createProject,
  createProjectSchema,
  getProjectSummary,
} from "@/server/services/projects";

export const GET = api(async (req, meta) => {
  const sp = req.nextUrl.searchParams;
  const projects = await listVisibleProjects(meta.ctx, {
    status: sp.get("status") ?? undefined,
    search: sp.get("search") ?? undefined,
  });
  const enriched = await Promise.all(
    projects.map(async (p) => ({
      ...p,
      summary: await getProjectSummary(meta.ctx, p.id),
    })),
  );
  return ok(enriched);
});

export const POST = api(
  async (req, meta) => {
    const result = await createProject(meta.ctx, parsed(req));
    return ok(result, { status: 201 });
  },
  { parse: createProjectSchema , permission: "project:create"},
);
