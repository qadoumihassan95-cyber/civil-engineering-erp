import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Storage provider abstraction. Business records store metadata in the
 * `files` table and reference blobs by provider + storage key, so object
 * storage (S3-compatible) can be enabled without changing business data.
 */
export interface StorageProvider {
  name: string;
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  getMeta(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  name = "local";
  private dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(process.cwd(), dir);
  }

  private pathFor(key: string): string {
    const safe = key.replaceAll("..", "").replace(/^\/+/, "");
    return path.join(this.dir, safe);
  }

  async save(key: string, data: Buffer, _contentType: string): Promise<void> {
    const full = this.pathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async getMeta(key: string): Promise<{ size: number } | null> {
    try {
      const s = await stat(this.pathFor(key));
      return { size: s.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {
      // already gone
    }
  }
}

class S3StorageProvider implements StorageProvider {
  name = "s3";

  private ensureConfigured(): void {
    const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(
        `S3 storage is not configured. Missing environment variables: ${missing.join(", ")}. ` +
          "Set STORAGE_PROVIDER=local for local file storage or configure the S3 variables.",
      );
    }
  }

  async save(): Promise<void> {
    this.ensureConfigured();
    throw new Error("S3 provider save is not implemented; plug in an S3 SDK client here.");
  }

  async get(): Promise<Buffer> {
    this.ensureConfigured();
    throw new Error("S3 provider get is not implemented; plug in an S3 SDK client here.");
  }

  async getMeta(): Promise<{ size: number } | null> {
    this.ensureConfigured();
    throw new Error("S3 provider getMeta is not implemented.");
  }

  async delete(): Promise<void> {
    this.ensureConfigured();
    throw new Error("S3 provider delete is not implemented.");
  }
}

let provider: StorageProvider | null = null;

export function storageProvider(): StorageProvider {
  if (provider) return provider;
  const name = process.env.STORAGE_PROVIDER ?? "local";
  if (name === "s3") {
    provider = new S3StorageProvider();
  } else {
    provider = new LocalStorageProvider(process.env.STORAGE_LOCAL_DIR ?? "./uploads");
  }
  return provider;
}

export function newStorageKey(ext: string): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}/${crypto.randomUUID()}${ext}`;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
]);

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function safeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const allowed = new Set([
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf", ".csv", ".xls", ".xlsx",
    ".doc", ".docx", ".zip", ".txt",
  ]);
  return allowed.has(ext) ? ext : "";
}

export interface SavedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  provider: string;
  key: string;
  checksum: string;
}
