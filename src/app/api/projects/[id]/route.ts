
import { api, ok, parsed } from "@/server/api/route";
import {
  getProject,
  updateProject,
  updateProjectSchema,
  getProjectMembers,
  getProjectSummary,
} from "@/server/services/projects";

export const GET = api(async (_req, meta, params) => {
  const project = await getProject(meta.ctx, params.id);
  const [summary, members] = await Promise.all([
    getProjectSummary(meta.ctx, params.id),
    getProjectMembers(meta.ctx, params.id),
  ]);
  return ok({ project, summary, members });
});

export const PATCH = api(
  async (req, meta, params) => {
    const result = await updateProject(meta.ctx, params.id, parsed(req));
    return ok(result);
  },
  { parse: updateProjectSchema , permission: "project:update"},
);
