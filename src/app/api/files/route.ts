
import { files } from "@/db/schema";
import { api, ok } from "@/server/api/route";
import { storageProvider, sha256, MAX_FILE_SIZE, isAllowedMime, safeExtension, newStorageKey } from "@/server/storage";
import { newId } from "@/server/lib/ids";
import { AppError } from "@/server/lib/errors";
import { audit } from "@/server/services/audit";

export const POST = api(async (req, meta) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION", "Expected multipart form data");
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new AppError("VALIDATION", "No file provided", { i18nKey: "errors.unknownFile" });
  }
  if (file.size === 0) throw new AppError("VALIDATION", "Empty file", { i18nKey: "errors.unknownFile" });
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError("VALIDATION", "File too large (max 20 MB)", { i18nKey: "errors.fileTooLarge" });
  }
  if (!isAllowedMime(file.type)) {
    throw new AppError("VALIDATION", "File type not allowed", { i18nKey: "errors.unsupportedFileType" });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const ext = safeExtension(file.name);
  const provider = storageProvider();
  const key = newStorageKey(ext);
  await provider.save(key, data, file.type);

  const id = newId();
  await meta.ctx.db.insert(files).values({
    id,
    name: file.name,
    mime: file.type,
    size: file.size,
    storage_provider: provider.name,
    storage_key: key,
    checksum: sha256(data),
    uploaded_by: meta.user.id,
  });
  await audit(meta.ctx, {
    action: "created",
    entityType: "file",
    entityId: id,
    after: { name: file.name, size: file.size },
  });
  return ok({ id, name: file.name, mime: file.type, size: file.size });
});
