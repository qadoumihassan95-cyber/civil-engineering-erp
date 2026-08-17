"use client";

import { useState, useRef } from "react";
import { Button } from "./controls";
import { useApi, useT, useToast } from "@/components/providers";

export function FileUploadButton({
  onUploaded,
  label,
  variant = "outline",
  size = "md",
  multiple = true,
}: {
  onUploaded: (file: { id: string; name: string; mime: string; size: number }) => void;
  label?: string;
  variant?: "outline" | "primary" | "secondary";
  size?: "sm" | "md";
  multiple?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const api = useApi();
  const toast = useToast();
  const t = useT();

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(t("errors.fileTooLarge"));
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.call<{ id: string; name: string; mime: string; size: number }>("POST", "/api/files", fd);
        onUploaded(res);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.txt"
        multiple={multiple}
        onChange={(e) => handle(e.target.files)}
      />
      <Button type="button" variant={variant} size={size} loading={busy} onClick={() => inputRef.current?.click()}>
        {label ?? t("common.upload")}
      </Button>
    </>
  );
}
