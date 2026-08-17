
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { importBoqCsv } from "@/server/services/importExport";

const importSchema = z.object({ csv: z.string().min(1) });

export const POST = api(
  async (req, meta, params) => {
    const result = await importBoqCsv(meta.ctx, params.id, parsed<{ csv: string }>(req).csv);
    return ok(result);
  },
  { parse: importSchema , permission: "boq:manage"},
);
