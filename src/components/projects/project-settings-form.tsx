"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Checkbox, Field, Select } from "@/components/ui/controls";
import { Card, CardHeader } from "@/components/ui/surfaces";

export function ProjectSettingsForm({
  projectId,
  settings,
  name,
  canEditPolicy,
}: {
  projectId: string;
  settings: { dailyReportApproval: string; stockAdjustmentPolicy: string; allowNegativeStock: boolean };
  name: string;
  canEditPolicy: boolean;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(settings);

  async function save() {
    setBusy(true);
    try {
      await api.call("PUT", `/api/projects/${projectId}/settings`, form);
      toast.success(t("common.saved"));
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader title={`${t("projects.settings")} — ${name}`} />
        <div className="space-y-5">
          <Field
            label={t("projects.approvalPolicy")}
            hint={form.dailyReportApproval === "none" ? t("dailyReport.finalPolicy") : t("dailyReport.managerApproval")}
          >
            <Select
              value={form.dailyReportApproval}
              disabled={!canEditPolicy}
              onChange={(e) => setForm({ ...form, dailyReportApproval: e.target.value })}
              className="max-w-xs"
            >
              <option value="manager">{t("projects.policyManager")}</option>
              <option value="none">{t("projects.policyNone")}</option>
            </Select>
          </Field>
          <Field label={t("projects.stockPolicy")}>
            <Select
              value={form.stockAdjustmentPolicy}
              disabled={!canEditPolicy}
              onChange={(e) => setForm({ ...form, stockAdjustmentPolicy: e.target.value })}
              className="max-w-xs"
            >
              <option value="controlled">{t("projects.policyControlled")}</option>
              <option value="simple">{t("projects.policySimple")}</option>
            </Select>
          </Field>
          <Checkbox
            checked={form.allowNegativeStock}
            onChange={(v) => setForm({ ...form, allowNegativeStock: v })}
            label={t("projects.allowNegative")}
          />
          {canEditPolicy && (
            <Button onClick={save} loading={busy} disabled={!canEditPolicy}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
