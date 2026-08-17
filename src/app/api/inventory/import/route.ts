
import { z } from "zod";
import { api, ok, parsed } from "@/server/api/route";
import { importMaterialsCsv } from "@/server/services/importExport";

const importSchema = z.object({ csv: z.string().min(1) });

export const POST = api(
  async (req, meta) => {
    const result = await importMaterialsCsv(meta.ctx, parsed<{ csv: string }>(req).csv);
    return ok(result);
  },
  { parse: importSchema , permission: "inventory:transact"},
);
