
import { z } from "zod";
import { eq } from "drizzle-orm";
import { files } from "@/db/schema";
import { api, ok, parsed } from "@/server/api/route";
import { uploadDocument, documentSchema } from "@/server/services/documents";
import { storageProvider } from "@/server/storage";
import { AppError } from "@/server/lib/errors";

const uploadSchema = documentSchema.extend({ file_id: z.string().uuid() });

export const POST = api(
  async (req, meta) => {
    const data = uploadSchema.parse(parsed(req));
    const [file] = await meta.ctx.db.select().from(files).where(eq(files.id, data.file_id)).limit(1);
    if (!file) {
      throw new AppError("NOT_FOUND", "File not found", { i18nKey: "errors.unknownFile" });
    }
    const provider = storageProvider();
    const blob = await provider.get(file.storage_key);
    const result = await uploadDocument(
      meta.ctx,
      {
        project_id: data.project_id,
        kind: data.kind,
        title: data.title,
        description: data.description,
        discipline: data.discipline,
        issue_date: data.issue_date,
        series_key: data.series_key,
      },
      { name: file.name, mime: file.mime, data: blob },
    );
    return ok(result, { status: 201 });
  },
  { parse: uploadSchema , permission: "document:upload"},
);
