"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { PageHeader, EmptyState, Card } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";
import { FileUploadButton } from "@/components/ui/file-upload";
import { formatNumber, formatDateTime } from "@/server/i18n";

interface WirRow {
  id: string;
  number: string;
  status: string;
  location: string;
  zone: string | null;
  floor: string | null;
  submitted_qty: string;
  approved_qty: string | null;
  unit: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  revision: number;
  engineer_name: string | null;
  reviewer_name: string | null;
  item_code: string;
  item_description: string;
  description: string | null;
}

interface BoqItemOpt {
  id: string;
  code: string;
  description: string;
  unit: string;
  contract_qty: string;
  remaining_qty: string;
}

export function WirList({
  projectId,
  locale,
  wirs,
  boqItems,
  canCreate,
}: {
  projectId: string;
  locale: string;
  wirs: WirRow[];
  boqItems: BoqItemOpt[];
  canCreate: boolean;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    boq_item_id: "",
    location: "",
    zone: "",
    floor: "",
    description: "",
    submitted_qty: "",
  });
  const [fileIds, setFileIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return wirs.filter((w) => {
      if (statusFilter && w.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          w.number.toLowerCase().includes(s) ||
          w.location.toLowerCase().includes(s) ||
          w.item_code.toLowerCase().includes(s) ||
          (w.description ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [wirs, statusFilter, search]);

  const selectedItem = boqItems.find((b) => b.id === form.boq_item_id);

  async function create() {
    setBusy(true);
    try {
      const res = await api.call<{ id: string }>("POST", `/api/projects/${projectId}/wir`, {
        ...form,
        zone: form.zone || null,
        floor: form.floor || null,
        description: form.description || null,
        file_ids: fileIds,
      });
      toast.success(t("common.createdMsg"));
      setOpen(false);
      router.push(`/wir/${res.id}`);
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("wir.title")}
        actions={canCreate ? <Button onClick={() => setOpen(true)}>+ {t("wir.new")}</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option>
          <option value="draft">{t("wir.statusDraft")}</option>
          <option value="submitted">{t("wir.statusSubmitted")}</option>
          <option value="under_review">{t("wir.statusUnderReview")}</option>
          <option value="approved">{t("wir.statusApproved")}</option>
          <option value="approved_with_comments">{t("wir.statusApprovedWithComments")}</option>
          <option value="returned">{t("wir.statusReturned")}</option>
          <option value="rejected">{t("wir.statusRejected")}</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("wir.noWirs")} />
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => (
            <Link key={w.id} href={`/wir/${w.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 py-3 transition-shadow hover:shadow-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{w.number}</span>
                    <StatusBadge kind="wir" status={w.status} />
                    {w.revision > 0 && <span className="text-[10px] text-slate-400">{t("wir.revisionShort", { n: w.revision })}</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {w.item_code} — {w.location}
                    {w.zone ? ` · ${w.zone}` : ""}
                    {w.floor ? ` · ${w.floor}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-end">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t("wir.submittedQty")}</div>
                    <div className="font-mono text-sm font-semibold text-slate-800">
                      {formatNumber(w.submitted_qty, locale)} {w.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t("wir.approvedQty")}</div>
                    <div className="font-mono text-sm font-semibold text-emerald-700">
                      {w.approved_qty ? `${formatNumber(w.approved_qty, locale)} ${w.unit}` : "—"}
                    </div>
                  </div>
                  <div className="hidden text-xs text-slate-400 sm:block">
                    <div>{w.engineer_name ?? "—"}</div>
                    <div>{w.submitted_at ? formatDateTime(w.submitted_at, locale) : ""}</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("wir.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={!form.boq_item_id || !form.location || !form.submitted_qty}
            >
              {t("wir.createDraft")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("wir.boqItem")} required>
            <Select value={form.boq_item_id} onChange={(e) => setForm({ ...form, boq_item_id: e.target.value })}>
              <option value="">{t("boq.chooseSection")}</option>
              {boqItems.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.description.slice(0, 60)}
                </option>
              ))}
            </Select>
          </Field>
          {selectedItem && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("boq.remaining")}: <span className="font-semibold">{formatNumber(selectedItem.remaining_qty, locale)} {selectedItem.unit}</span>
              {" · "}{t("boq.contractQty")}: {formatNumber(selectedItem.contract_qty, locale)}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("wir.location")} required>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label={t("wir.zone")} optional>
              <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </Field>
            <Field label={t("wir.floor")} optional>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </Field>
          </div>
          <Field label={t("wir.submittedQty")} required hint={selectedItem ? `${t("boq.remaining")}: ${formatNumber(selectedItem.remaining_qty, locale)} ${selectedItem.unit}` : undefined}>
            <Input value={form.submitted_qty} onChange={(e) => setForm({ ...form, submitted_qty: e.target.value })} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t("common.description")} optional>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t("wir.photos")} optional>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton
                label={t("common.upload")}
                onUploaded={(f) => setFileIds((prev) => [...prev, f.id])}
              />
              {fileIds.length > 0 && (
                <span className="text-xs text-slate-500">{t("common.attachmentsCount", { count: fileIds.length })}</span>
              )}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
