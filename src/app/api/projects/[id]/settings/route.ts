
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { updateProjectStatus, setProjectSettings } from "@/server/services/projects";

const statusSchema = z.object({
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
});

const settingsSchema = z.object({
  dailyReportApproval: z.enum(["manager", "none"]),
  stockAdjustmentPolicy: z.enum(["simple", "controlled"]),
  allowNegativeStock: z.boolean(),
});

export const PATCH = api(
  async (req, meta, params) => {
    await updateProjectStatus(meta.ctx, params.id, parsed<{ status: string }>(req).status);
    return ok({ ok: true });
  },
  { parse: statusSchema, permission: ["project:settings", "project:update"] },
);

export const PUT = api(
  async (req, meta, params) => {
    await setProjectSettings(meta.ctx, params.id, parsed(req));
    return ok({ ok: true });
  },
  { parse: settingsSchema , permission: "project:settings"},
);
