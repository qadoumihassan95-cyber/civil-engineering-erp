"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Field, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { useApi, useT, useToast } from "@/components/providers";

export function NewProjectButton() {
  const t = useT();
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    client_name: "",
    consultant_name: "",
    contractor_name: "",
    location: "",
    contract_value: "0",
    start_date: "",
    planned_end_date: "",
    currency: "JOD",
  });

  async function submit() {
    setBusy(true);
    try {
      const res = await api.call<{ id: string }>("POST", "/api/projects", {
        ...form,
        contract_value: form.contract_value || "0",
        start_date: form.start_date || null,
        planned_end_date: form.planned_end_date || null,
      });
      toast.success(t("common.createdMsg"));
      setOpen(false);
      router.push(`/projects/${res.id}`);
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ {t("projects.new")}</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("projects.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} loading={busy} disabled={!form.code || !form.name}>
              {t("common.create")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("projects.code")} required>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={t("projects.codePlaceholder")} dir="ltr" />
          </Field>
          <Field label={t("projects.name")} required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("projects.client")}>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </Field>
          <Field label={t("projects.consultant")}>
            <Input value={form.consultant_name} onChange={(e) => setForm({ ...form, consultant_name: e.target.value })} />
          </Field>
          <Field label={t("projects.contractor")}>
            <Input value={form.contractor_name} onChange={(e) => setForm({ ...form, contractor_name: e.target.value })} />
          </Field>
          <Field label={t("projects.location")}>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field label={t("projects.contractValue")} required>
            <Input value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t("common.currency")}>
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="JOD">JOD</option>
              <option value="USD">USD</option>
              <option value="SAR">SAR</option>
            </Select>
          </Field>
          <Field label={t("projects.startDate")}>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label={t("projects.plannedEnd")}>
            <Input type="date" value={form.planned_end_date} onChange={(e) => setForm({ ...form, planned_end_date: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
