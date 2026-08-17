"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Textarea } from "@/components/ui/controls";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Card, CardHeader, KV, EmptyState } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { FileUploadButton } from "@/components/ui/file-upload";
import { formatNumber, formatDateTime } from "@/server/i18n";

interface WirDetailData {
  id: string;
  project_id: string;
  number: string;
  location: string;
  zone: string | null;
  floor: string | null;
  description: string | null;
  submitted_qty: string;
  approved_qty: string | null;
  unit: string;
  engineer_id: string;
  engineer_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  revision: number;
  created_at: string;
  item_code: string;
  item_description: string;
  item_contract_qty: string;
  item_approved_qty: string;
  events: {
    id: string;
    from_status: string | null;
    to_status: string;
    actor_name: string;
    comment: string | null;
    created_at: string;
    snapshot: Record<string, unknown> | null;
  }[];
  attachments: { id: string; name: string; mime: string; size: number }[];
}

export function WirDetail({
  wir,
  projectId,
  locale,
  perms,
  isCreator,
}: {
  wir: WirDetailData;
  projectId: string;
  locale: string;
  perms: { create: boolean; review: boolean; approve: boolean };
  isCreator: boolean;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState<null | "approved" | "approved_with_comments" | "returned" | "rejected">(null);
  const [comment, setComment] = useState("");
  const [approvedQty, setApprovedQty] = useState(wir.submitted_qty);
  const [editForm, setEditForm] = useState({
    location: wir.location,
    zone: wir.zone ?? "",
    floor: wir.floor ?? "",
    description: wir.description ?? "",
    submitted_qty: wir.submitted_qty,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = (wir.status === "draft" || wir.status === "returned") && perms.create && (isCreator || perms.approve);
  const canSubmit = (wir.status === "draft" || wir.status === "returned") && perms.create && (isCreator || perms.approve);
  const canReview = wir.status === "submitted" && perms.review;
  const canDecide = wir.status === "under_review" && perms.approve;
  const canDelete = wir.status === "draft" && perms.create && isCreator;

  function errMsg(e: unknown): string {
    const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
    return err.i18nKey ? t(err.i18nKey, err.params) : err.message;
  }

  async function action(url: string, body?: unknown, successMsg?: string) {
    setBusy(true);
    try {
      await api.call("POST", url, body ?? {});
      toast.success(successMsg ?? t("common.saved"));
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      setDecisionOpen(null);
    }
  }

  async function submitEdit() {
    setBusy(true);
    try {
      await api.call("PATCH", `/api/wir/${wir.id}`, {
        ...editForm,
        zone: editForm.zone || null,
        floor: editForm.floor || null,
        description: editForm.description || null,
      });
      toast.success(t("common.saved"));
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(fileId: string) {
    setBusy(true);
    try {
      await api.call("DELETE", `/api/wir/${wir.id}/files`, { file_id: fileId });
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const fmt = (v: string) => formatNumber(v, locale);
  const isImage = (mime: string) => mime.startsWith("image/");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/projects/${projectId}/wir`} className="text-sm text-slate-500 hover:text-primary-600">
          ← {t("common.back")}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/wir/${wir.id}`, "_blank")}>
            {t("common.print")}
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              {t("common.edit")}
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" onClick={() => action(`/api/wir/${wir.id}/submit`, {}, t("common.submittedMsg"))}>
              {wir.status === "returned" ? t("wir.resubmit") : t("wir.submit")}
            </Button>
          )}
          {canReview && (
            <Button size="sm" onClick={() => action(`/api/wir/${wir.id}/review`, {}, t("common.saved"))}>
              {t("wir.startReview")}
            </Button>
          )}
          {canDecide && (
            <>
              <Button size="sm" variant="success" onClick={() => { setApprovedQty(wir.submitted_qty); setComment(""); setDecisionOpen("approved"); }}>
                {t("wir.approve")}
              </Button>
              <Button size="sm" variant="warning" onClick={() => { setApprovedQty(wir.submitted_qty); setComment(""); setDecisionOpen("approved_with_comments"); }}>
                {t("wir.approveWithComments")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setComment(""); setDecisionOpen("returned"); }}>
                {t("wir.return")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => { setComment(""); setDecisionOpen("rejected"); }}>
                {t("wir.reject")}
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className="print-area mb-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-bold tracking-wider text-primary-600">{t("wir.title").toUpperCase()}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{wir.number}</div>
          </div>
          <StatusBadge kind="wir" status={wir.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KV label={t("wir.boqItem")}>
            <div className="font-mono text-xs font-semibold">{wir.item_code}</div>
            <div className="mt-0.5 text-xs text-slate-500">{wir.item_description}</div>
          </KV>
          <KV label={t("wir.location")}>{wir.location}</KV>
          <KV label={t("wir.zone")}>{wir.zone ?? "—"}</KV>
          <KV label={t("wir.floor")}>{wir.floor ?? "—"}</KV>
          <KV label={t("wir.submittedQty")}>
            <span className="font-mono font-semibold">{fmt(wir.submitted_qty)} {wir.unit}</span>
          </KV>
          <KV label={t("wir.approvedQty")}>
            {wir.approved_qty ? (
              <span className="font-mono font-semibold text-emerald-700">{fmt(wir.approved_qty)} {wir.unit}</span>
            ) : (
              "—"
            )}
          </KV>
          <KV label={t("boq.contractQty")}>
            <span className="font-mono">{fmt(wir.item_contract_qty)} {wir.unit}</span>
          </KV>
          <KV label={t("boq.approved")}>
            <span className="font-mono">{fmt(wir.item_approved_qty)} {wir.unit}</span>
          </KV>
          <KV label={t("wir.engineer")}>{wir.engineer_name ?? "—"}</KV>
          <KV label={t("wir.submittedAt")}>{wir.submitted_at ? formatDateTime(wir.submitted_at, locale) : "—"}</KV>
          <KV label={t("wir.reviewer")}>{wir.reviewer_name ?? "—"}</KV>
          <KV label={t("wir.reviewedAt")}>{wir.reviewed_at ? formatDateTime(wir.reviewed_at, locale) : "—"}</KV>
        </div>
        {wir.description && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{wir.description}</div>
        )}
        {wir.review_comment && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">{t("wir.reviewComment")}: </span>
            {wir.review_comment}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("wir.timeline")} />
          <ol className="relative space-y-4 border-s-2 border-slate-100 ps-4">
            {wir.events.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -start-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500" />
                <div className="text-sm font-semibold text-slate-800">
                  {ev.from_status ? `${t(`wir.status${cap(ev.from_status)}`)} → ` : ""}
                  {t(`wir.status${cap(ev.to_status)}`)}
                </div>
                <div className="text-xs text-slate-500">
                  {ev.actor_name} · {formatDateTime(ev.created_at, locale)}
                </div>
                {ev.comment && <div className="mt-1 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{ev.comment}</div>}
              </li>
            ))}
          </ol>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t("wir.photos")}
            actions={
              (wir.status === "draft" || wir.status === "returned" || wir.status === "submitted" || wir.status === "under_review") && perms.create ? (
                <FileUploadButton
                  label={t("common.upload")}
                  size="sm"
                  onUploaded={async (f) => {
                    await api.call("POST", `/api/wir/${wir.id}/files`, { file_ids: [f.id] });
                    toast.success(t("documents.uploadSuccess"));
                    router.refresh();
                  }}
                />
              ) : undefined
            }
          />
          {wir.attachments.length === 0 ? (
            <EmptyState title={t("common.emptyState")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {wir.attachments.map((f) => (
                <div key={f.id} className="group relative overflow-hidden rounded-md border border-slate-200">
                  {isImage(f.mime) ? (
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/files/${f.id}`} alt={f.name} className="h-32 w-full object-cover" />
                    </a>
                  ) : (
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex h-32 items-center justify-center bg-slate-50">
                      <span className="text-xs text-slate-500">{f.name}</span>
                    </a>
                  )}
                  <div className="truncate px-2 py-1 text-[10px] text-slate-500">{f.name}</div>
                  {(wir.status === "draft" || wir.status === "returned") && (
                    <button
                      onClick={() => removeFile(f.id)}
                      className="absolute end-1 top-1 rounded bg-white/90 p-1 text-xs text-rose-600 opacity-0 shadow group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            {t("print.electronicApproval")}
          </div>
        </Card>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`${t("wir.editDraft")} — ${wir.number}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitEdit} loading={busy}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("wir.location")} required>
              <Input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
            </Field>
            <Field label={t("wir.zone")} optional>
              <Input value={editForm.zone} onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })} />
            </Field>
            <Field label={t("wir.floor")} optional>
              <Input value={editForm.floor} onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })} />
            </Field>
          </div>
          <Field label={t("wir.submittedQty")} required>
            <Input value={editForm.submitted_qty} onChange={(e) => setEditForm({ ...editForm, submitted_qty: e.target.value })} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t("common.description")} optional>
            <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!decisionOpen}
        onClose={() => setDecisionOpen(null)}
        title={t(`wir.${decisionOpen === "approved" ? "approve" : decisionOpen === "approved_with_comments" ? "approveWithComments" : decisionOpen === "returned" ? "return" : "reject"}`)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDecisionOpen(null)}>{t("common.cancel")}</Button>
            <Button
              variant={decisionOpen === "rejected" ? "danger" : decisionOpen === "returned" ? "outline" : "success"}
              loading={busy}
              onClick={() =>
                action(
                  `/api/wir/${wir.id}/decide`,
                  {
                    decision: decisionOpen,
                    comment: comment || null,
                    approved_qty:
                      decisionOpen === "approved" || decisionOpen === "approved_with_comments" ? approvedQty : null,
                  },
                  decisionOpen === "approved" || decisionOpen === "approved_with_comments" ? t("common.approvedMsg") : decisionOpen === "rejected" ? t("common.rejectedMsg") : t("common.saved"),
                )
              }
            >
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        {(decisionOpen === "approved" || decisionOpen === "approved_with_comments") && (
          <Field label={t("wir.approveQtyLabel")} hint={t("wir.approveQtyHint")} className="mb-3">
            <Input value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} inputMode="decimal" dir="ltr" />
          </Field>
        )}
        <Field label={t("common.comment")} required={decisionOpen === "returned" || decisionOpen === "rejected"}>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.call("DELETE", `/api/wir/${wir.id}`);
            toast.success(t("common.deletedMsg"));
            router.push(`/projects/${projectId}/wir`);
          } catch (e) {
            toast.error(errMsg(e));
          } finally {
            setBusy(false);
            setConfirmDelete(false);
          }
        }}
        title={t("common.confirmDelete")}
        message={t("common.confirmDelete")}
        danger
        loading={busy}
      />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
