"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Badge } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { PageHeader, EmptyState } from "@/components/ui/surfaces";
import { FileUploadButton } from "@/components/ui/file-upload";
import { formatDate } from "@/server/i18n";

interface DocRow {
  id: string;
  project_id: string | null;
  kind: string;
  title: string;
  discipline: string | null;
  revision: string;
  series_key: string;
  status: string;
  issue_date: string | null;
  created_at: string;
  file_id: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  project_code: string | null;
  uploader_name: string | null;
}

interface InitialData {
  rows: DocRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function DocumentsView({
  locale,
  initial,
  projects,
  canUpload,
  canManage,
}: {
  locale: string;
  initial: InitialData;
  projects: { id: string; code: string; name: string }[];
  canUpload: boolean;
  canManage: boolean;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState(initial.rows);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revisions, setRevisions] = useState<{ id: string; revision: string; status: string; created_at: string; file_name: string; file_size: number }[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [form, setForm] = useState({
    project_id: "",
    kind: "drawing",
    title: "",
    discipline: "",
    issue_date: "",
    series_key: "",
    file: null as { id: string; name: string; mime: string; size: number } | null,
  });

  const kindFilter = sp.get("kind") ?? "";
  const projectFilter = sp.get("project_id") ?? "";
  const q = sp.get("q") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/documents?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => r.title.toLowerCase().includes(s) || r.series_key.toLowerCase().includes(s));
  }, [rows, q]);

  async function load() {
    const params = new URLSearchParams(sp.toString());
    const res = await api.call<InitialData>("GET", `/api/documents?${params.toString()}`);
    setRows(res.rows);
  }

  async function upload() {
    if (!form.file) return;
    setBusy(true);
    try {
      await api.call("POST", "/api/documents/create", {
        project_id: form.project_id || null,
        kind: form.kind,
        title: form.title,
        discipline: form.discipline || null,
        issue_date: form.issue_date || null,
        series_key: form.series_key || undefined,
        file_id: form.file.id,
      });
      toast.success(t("documents.uploadSuccess"));
      setUploadOpen(false);
      setForm({ project_id: "", kind: "drawing", title: "", discipline: "", issue_date: "", series_key: "", file: null });
      await load();
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function showRevisions(series: string, projectId: string | null) {
    try {
      const res = await api.call<{ id: string; revision: string; status: string; created_at: string; file_name: string; file_size: number }[]>(
        "GET",
        `/api/documents/revisions?series=${encodeURIComponent(series)}&project_id=${projectId ?? ""}`,
      );
      setRevisions(res);
    } catch {
      setRevisions([]);
    }
  }

  async function deleteDoc(id: string) {
    setBusy(true);
    try {
      await api.call("DELETE", `/api/documents/${id}`);
      toast.success(t("common.deletedMsg"));
      setRevisions(null);
      await load();
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("documents.title")}
        actions={canUpload ? <Button onClick={() => setUploadOpen(true)}>+ {t("documents.upload")}</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={kindFilter} onChange={(e) => setParam("kind", e.target.value)} className="w-40">
          <option value="">{t("documents.all")}</option>
          <option value="drawing">{t("documents.kindDrawing")}</option>
          <option value="document">{t("documents.kindDocument")}</option>
          <option value="photo">{t("documents.kindPhoto")}</option>
          <option value="report">{t("documents.kindReport")}</option>
        </Select>
        <Select value={projectFilter} onChange={(e) => setParam("project_id", e.target.value)} className="w-52">
          <option value="">{t("expenses.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("documents.noDocs")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">{t("documents.titleLabel")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("documents.kind")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("documents.revision")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("documents.discipline")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("common.project")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("documents.issueDate")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="max-w-64 px-4 py-2.5">
                    <div className="truncate text-xs font-semibold text-slate-800">{r.title}</div>
                    <div className="truncate text-[10px] text-slate-400">{r.file_name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{t(`documents.kind${cap(r.kind)}`)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{r.revision}</td>
                  <td className="px-4 py-2.5 text-xs">{r.discipline ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.project_code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{r.issue_date ? formatDate(r.issue_date, locale) : "—"}</td>
                  <td className="px-4 py-2.5 text-end whitespace-nowrap">
                    <a href={`/api/files/${r.file_id}`} target="_blank" rel="noreferrer" className="me-2 text-xs font-semibold text-primary-600 hover:underline">
                      {t("common.download")}
                    </a>
                    <button className="me-2 text-xs font-semibold text-slate-600 hover:underline" onClick={() => showRevisions(r.series_key, r.project_id)}>
                      {t("documents.revisions")}
                    </button>
                    {canManage && (
                      <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => { setDeleteTarget(r.id); setConfirmDelete(true); }}>
                        {t("common.delete")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t("documents.upload")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={upload} loading={busy} disabled={!form.file || !form.title}>{t("documents.upload")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("documents.titleLabel")} required>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label={t("documents.kind")}>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="drawing">{t("documents.kindDrawing")}</option>
                <option value="document">{t("documents.kindDocument")}</option>
                <option value="photo">{t("documents.kindPhoto")}</option>
                <option value="report">{t("documents.kindReport")}</option>
              </Select>
            </Field>
            <Field label={t("common.project")} optional>
              <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("documents.discipline")} optional>
              <Input value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} placeholder={t("documents.disciplineHint")} />
            </Field>
            <Field label={t("documents.issueDate")} optional>
              <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </Field>
            <Field label={t("documents.series")} optional hint={t("documents.newRevision")}>
              <Input value={form.series_key} onChange={(e) => setForm({ ...form, series_key: e.target.value })} dir="ltr" placeholder={t("documents.seriesPlaceholder")} />
            </Field>
          </div>
          <Field label={t("documents.file")} required>
            {form.file ? (
              <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-700">{form.file.name}</span>
                <button className="text-rose-600" onClick={() => setForm({ ...form, file: null })}>✕</button>
              </div>
            ) : (
              <FileUploadButton multiple={false} label={t("documents.chooseFile")} onUploaded={(f) => setForm({ ...form, file: f })} />
            )}
          </Field>
        </div>
      </Modal>

      <Modal open={!!revisions} onClose={() => setRevisions(null)} title={t("documents.revisions")}>
        {revisions && revisions.length === 0 ? (
          <EmptyState title={t("common.emptyState")} />
        ) : (
          <div className="divide-y divide-slate-100">
            {revisions?.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-mono font-bold text-slate-800">{t("documents.revisionShort", { n: r.revision })}</span>
                  <span className="ms-2 text-xs text-slate-500">{r.file_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.status === "superseded" ? <Badge tone="gray">{t("documents.superseded")}</Badge> : <Badge tone="green">{t("documents.current")}</Badge>}
                  <span className="text-xs text-slate-400">{formatDate(r.created_at, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteTarget && deleteDoc(deleteTarget)}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
