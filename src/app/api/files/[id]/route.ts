import { NextResponse } from "next/server";


import { api } from "@/server/api/route";
import { storageProvider } from "@/server/storage";
import { getFileRow, canAccessFile } from "@/server/services/documents";
import { AppError } from "@/server/lib/errors";

const INLINE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const GET = api(async (_req, meta, params) => {
  const fileId = params.id;
  const file = await getFileRow(meta.ctx, fileId);
  if (!file) throw new AppError("NOT_FOUND", "File not found", { i18nKey: "errors.unknownFile" });
  if (!(await canAccessFile(meta.ctx, fileId))) {
    throw new AppError("FORBIDDEN", "You cannot access this file", { i18nKey: "errors.forbidden" });
  }
  const provider = storageProvider();
  const data = await provider.get(file.storage_key);
  const disposition = INLINE.has(file.mime) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
});
