"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Textarea, Badge } from "@/components/ui/controls";
import { Card, CardHeader } from "@/components/ui/surfaces";
import { FileUploadButton } from "@/components/ui/file-upload";

interface BoqOpt {
  id: string;
  code: string;
  description: string;
  unit: string;
}
interface MaterialOpt {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface FormData {
  report_date: string;
  weather_condition: string;
  temp_min: string;
  temp_max: string;
  wind: string;
  site_conditions: string;
  notes: string;
  manpower: { labor_type: string; count: string }[];
  subcontractors: { name: string; crew_count: string; work_done: string }[];
  equipment: { name: string; hours: string; notes: string }[];
  activities: { boq_item_id: string; description: string; qty: string; unit: string; location: string }[];
  materials_received: { material_id: string; name: string; qty: string; unit: string; supplier: string }[];
  materials_consumed: { material_id: string; name: string; qty: string; unit: string; source: string }[];
  delays: { description: string; duration_hours: string; party: string }[];
  incidents: { description: string; severity: string; action_taken: string }[];
  safety: { observation: string; action: string }[];
  visitors: { name: string; organization: string; purpose: string }[];
  file_ids: string[];
}

const empty: FormData = {
  report_date: new Date().toISOString().slice(0, 10),
  weather_condition: "",
  temp_min: "",
  temp_max: "",
  wind: "",
  site_conditions: "",
  notes: "",
  manpower: [],
  subcontractors: [],
  equipment: [],
  activities: [],
  materials_received: [],
  materials_consumed: [],
  delays: [],
  incidents: [],
  safety: [],
  visitors: [],
  file_ids: [],
};

function RowCard({
  title,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} actions={<Button variant="outline" size="sm" onClick={onAdd}>+ {addLabel}</Button>} />
      {children}
    </Card>
  );
}

function Row({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  const { t } = useApp();
  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2">
      <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3">{children}</div>
      <button onClick={onRemove} className="mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label={t("common.remove")}>
        ✕
      </button>
    </div>
  );
}

export function DailyReportForm({
  projectId,
  boqItems,
  materials,
  initial,
  reportId,
}: {
  projectId: string;
  boqItems: BoqOpt[];
  materials: MaterialOpt[];
  initial?: FormData;
  reportId?: string;
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm((f) => ({ ...f, [key]: value }));

  function updateRow<K extends keyof FormData, _T extends { [P in K]: unknown[] }>(key: K, idx: number, patch: Partial<FormData[K][number]>) {
    const list = [...(form[key] as unknown[])] as unknown[];
    list[idx] = { ...(list[idx] as object), ...patch };
    set(key, list as FormData[K]);
  }

  function addRow<K extends keyof FormData>(key: K, value: FormData[K][number]) {
    set(key, [...(form[key] as unknown[]), value] as FormData[K]);
  }

  function removeRow<K extends keyof FormData>(key: K, idx: number) {
    set(key, (form[key] as unknown[]).filter((_, i) => i !== idx) as FormData[K]);
  }

  async function save(submit: boolean) {
    setBusy(true);
    try {
      const payload = {
        report_date: form.report_date,
        weather: {
          condition: form.weather_condition || undefined,
          temp_min: form.temp_min ? Number(form.temp_min) : null,
          temp_max: form.temp_max ? Number(form.temp_max) : null,
          wind: form.wind || undefined,
        },
        site_conditions: form.site_conditions || null,
        notes: form.notes || null,
        manpower: form.manpower.map((m) => ({ labor_type: m.labor_type, count: Number(m.count) || 0 })),
        subcontractors: form.subcontractors.map((s) => ({
          name: s.name,
          crew_count: s.crew_count ? Number(s.crew_count) : null,
          work_done: s.work_done || undefined,
        })),
        equipment: form.equipment.map((e) => ({ name: e.name, hours: e.hours || null, notes: e.notes || undefined })),
        activities: form.activities.map((a) => ({
          boq_item_id: a.boq_item_id || null,
          description: a.description,
          qty: a.qty,
          unit: a.unit || undefined,
          location: a.location || undefined,
        })),
        materials_received: form.materials_received.map((m) => ({
          material_id: m.material_id || null,
          name: m.name,
          qty: m.qty,
          unit: m.unit || undefined,
          supplier: m.supplier || undefined,
        })),
        materials_consumed: form.materials_consumed.map((m) => ({
          material_id: m.material_id || null,
          name: m.name,
          qty: m.qty,
          unit: m.unit || undefined,
          source: m.source || undefined,
        })),
        delays: form.delays.map((d) => ({
          description: d.description,
          duration_hours: d.duration_hours || null,
          party: d.party || undefined,
        })),
        incidents: form.incidents.map((i) => ({
          description: i.description,
          severity: i.severity || undefined,
          action_taken: i.action_taken || undefined,
        })),
        safety: form.safety.map((s) => ({ observation: s.observation, action: s.action || undefined })),
        visitors: form.visitors.map((v) => ({
          name: v.name,
          organization: v.organization || undefined,
          purpose: v.purpose || undefined,
        })),
        file_ids: form.file_ids,
      };

      if (reportId) {
        await api.call("PATCH", `/api/daily-reports/${reportId}`, payload);
        if (submit) await api.call("POST", `/api/daily-reports/${reportId}/submit`, {});
        toast.success(submit ? t("common.submittedMsg") : t("common.saved"));
        router.push(`/daily-reports/${reportId}`);
      } else {
        const res = await api.call<{ id: string }>("POST", `/api/projects/${projectId}/daily-reports`, payload);
        if (submit) await api.call("POST", `/api/daily-reports/${res.id}/submit`, {});
        toast.success(submit ? t("common.submittedMsg") : t("common.saved"));
        router.push(`/daily-reports/${res.id}`);
      }
      router.refresh();
    } catch (e) {
      const err = e as Error & { i18nKey?: string; params?: Record<string, string | number> };
      toast.error(err.i18nKey ? t(err.i18nKey, err.params) : err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputS = "h-8 text-xs";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>← {t("common.back")}</Button>
        <div className="flex gap-2">
          <Button variant="outline" loading={busy} onClick={() => save(false)} disabled={!form.report_date}>
            {t("common.save")}
          </Button>
          <Button loading={busy} onClick={() => save(true)} disabled={!form.report_date}>
            {t("dailyReport.submit")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title={t("dailyReport.title")} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t("dailyReport.reportDate")} required>
            <Input type="date" value={form.report_date} onChange={(e) => set("report_date", e.target.value)} />
          </Field>
          <Field label={t("dailyReport.weatherCondition")}>
            <Select value={form.weather_condition} onChange={(e) => set("weather_condition", e.target.value)}>
              <option value="">—</option>
              {["sunny", "cloudy", "rainy", "windy", "dusty", "hot"].map((w) => (
                <option key={w} value={w}>{t(`dailyReport.${w}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("dailyReport.tempMin")} optional>
            <Input type="number" value={form.temp_min} onChange={(e) => set("temp_min", e.target.value)} />
          </Field>
          <Field label={t("dailyReport.tempMax")} optional>
            <Input type="number" value={form.temp_max} onChange={(e) => set("temp_max", e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t("dailyReport.siteConditions")} optional>
            <Textarea value={form.site_conditions} onChange={(e) => set("site_conditions", e.target.value)} className="min-h-16" />
          </Field>
          <Field label={t("dailyReport.notes")} optional>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
          </Field>
        </div>
      </Card>

      <RowCard title={t("dailyReport.manpower")} addLabel={t("dailyReport.addManpower")} onAdd={() => addRow("manpower", { labor_type: "", count: "" })}>
        {form.manpower.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("manpower", i)}>
            <Input className={inputS} placeholder={t("dailyReport.laborType")} value={row.labor_type} onChange={(e) => updateRow("manpower", i, { labor_type: e.target.value })} />
            <Input className={inputS} type="number" placeholder={t("dailyReport.count")} value={row.count} onChange={(e) => updateRow("manpower", i, { count: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.subcontractors")} addLabel={t("dailyReport.addSubcontractor")} onAdd={() => addRow("subcontractors", { name: "", crew_count: "", work_done: "" })}>
        {form.subcontractors.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("subcontractors", i)}>
            <Input className={inputS} placeholder={t("dailyReport.subcontractor")} value={row.name} onChange={(e) => updateRow("subcontractors", i, { name: e.target.value })} />
            <Input className={inputS} type="number" placeholder={t("dailyReport.crew")} value={row.crew_count} onChange={(e) => updateRow("subcontractors", i, { crew_count: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.workDone")} value={row.work_done} onChange={(e) => updateRow("subcontractors", i, { work_done: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.equipment")} addLabel={t("dailyReport.addEquipment")} onAdd={() => addRow("equipment", { name: "", hours: "", notes: "" })}>
        {form.equipment.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("equipment", i)}>
            <Input className={inputS} placeholder={t("dailyReport.equipmentName")} value={row.name} onChange={(e) => updateRow("equipment", i, { name: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.hours")} value={row.hours} onChange={(e) => updateRow("equipment", i, { hours: e.target.value })} />
            <Input className={inputS} placeholder={t("common.notes")} value={row.notes} onChange={(e) => updateRow("equipment", i, { notes: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.activities")} addLabel={t("dailyReport.addActivity")} onAdd={() => addRow("activities", { boq_item_id: "", description: "", qty: "", unit: "", location: "" })}>
        {form.activities.length > 0 && (
          <p className="mb-2 text-[11px] text-slate-400">{t("dailyReport.linkBoqItem")}</p>
        )}
        {form.activities.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("activities", i)}>
            <Select className={inputS} value={row.boq_item_id} onChange={(e) => updateRow("activities", i, { boq_item_id: e.target.value })}>
              <option value="">{t("boq.chooseSection")}</option>
              {boqItems.map((b) => (
                <option key={b.id} value={b.id}>{b.code}</option>
              ))}
            </Select>
            <Input className={`${inputS} col-span-2`} placeholder={t("dailyReport.activity")} value={row.description} onChange={(e) => updateRow("activities", i, { description: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.qty")} value={row.qty} onChange={(e) => updateRow("activities", i, { qty: e.target.value })} />
            <Input className={inputS} placeholder={t("common.unit")} value={row.unit} onChange={(e) => updateRow("activities", i, { unit: e.target.value })} />
            <Input className={inputS} placeholder={t("common.location")} value={row.location} onChange={(e) => updateRow("activities", i, { location: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.materialsReceived")} addLabel={t("dailyReport.addMaterial")} onAdd={() => addRow("materials_received", { material_id: "", name: "", qty: "", unit: "", supplier: "" })}>
        {form.materials_received.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("materials_received", i)}>
            <Select className={inputS} value={row.material_id} onChange={(e) => updateRow("materials_received", i, { material_id: e.target.value })}>
              <option value="">{t("inventory.chooseMaterial")}</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </Select>
            <Input className={inputS} placeholder={t("common.name")} value={row.name} onChange={(e) => updateRow("materials_received", i, { name: e.target.value })} />
            <Input className={inputS} placeholder={t("common.quantity")} value={row.qty} onChange={(e) => updateRow("materials_received", i, { qty: e.target.value })} />
            <Input className={inputS} placeholder={t("common.unit")} value={row.unit} onChange={(e) => updateRow("materials_received", i, { unit: e.target.value })} />
            <Input className={inputS} placeholder={t("common.supplier")} value={row.supplier} onChange={(e) => updateRow("materials_received", i, { supplier: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.materialsConsumed")} addLabel={t("dailyReport.addMaterial")} onAdd={() => addRow("materials_consumed", { material_id: "", name: "", qty: "", unit: "", source: "" })}>
        {form.materials_consumed.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("materials_consumed", i)}>
            <Select className={inputS} value={row.material_id} onChange={(e) => updateRow("materials_consumed", i, { material_id: e.target.value })}>
              <option value="">{t("inventory.chooseMaterial")}</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </Select>
            <Input className={inputS} placeholder={t("common.name")} value={row.name} onChange={(e) => updateRow("materials_consumed", i, { name: e.target.value })} />
            <Input className={inputS} placeholder={t("common.quantity")} value={row.qty} onChange={(e) => updateRow("materials_consumed", i, { qty: e.target.value })} />
            <Input className={inputS} placeholder={t("common.unit")} value={row.unit} onChange={(e) => updateRow("materials_consumed", i, { unit: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.source")} value={row.source} onChange={(e) => updateRow("materials_consumed", i, { source: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.delays")} addLabel={t("dailyReport.addDelay")} onAdd={() => addRow("delays", { description: "", duration_hours: "", party: "" })}>
        {form.delays.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("delays", i)}>
            <Input className={`${inputS} col-span-2`} placeholder={t("dailyReport.delayDescription")} value={row.description} onChange={(e) => updateRow("delays", i, { description: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.durationHours")} value={row.duration_hours} onChange={(e) => updateRow("delays", i, { duration_hours: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.party")} value={row.party} onChange={(e) => updateRow("delays", i, { party: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.incidents")} addLabel={t("dailyReport.addIncident")} onAdd={() => addRow("incidents", { description: "", severity: "", action_taken: "" })}>
        {form.incidents.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("incidents", i)}>
            <Input className={`${inputS} col-span-2`} placeholder={t("dailyReport.incident")} value={row.description} onChange={(e) => updateRow("incidents", i, { description: e.target.value })} />
            <Select className={inputS} value={row.severity} onChange={(e) => updateRow("incidents", i, { severity: e.target.value })}>
              <option value="">—</option>
              <option value="minor">{t("dailyReport.severityMinor")}</option>
              <option value="moderate">{t("dailyReport.severityModerate")}</option>
              <option value="major">{t("dailyReport.severityMajor")}</option>
            </Select>
            <Input className={inputS} placeholder={t("dailyReport.actionTaken")} value={row.action_taken} onChange={(e) => updateRow("incidents", i, { action_taken: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.safety")} addLabel={t("dailyReport.addSafety")} onAdd={() => addRow("safety", { observation: "", action: "" })}>
        {form.safety.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("safety", i)}>
            <Input className={`${inputS} col-span-2`} placeholder={t("dailyReport.observation")} value={row.observation} onChange={(e) => updateRow("safety", i, { observation: e.target.value })} />
            <Input className={inputS} placeholder={t("common.actions")} value={row.action} onChange={(e) => updateRow("safety", i, { action: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <RowCard title={t("dailyReport.visitors")} addLabel={t("dailyReport.addVisitor")} onAdd={() => addRow("visitors", { name: "", organization: "", purpose: "" })}>
        {form.visitors.map((row, i) => (
          <Row key={i} onRemove={() => removeRow("visitors", i)}>
            <Input className={inputS} placeholder={t("dailyReport.visitor")} value={row.name} onChange={(e) => updateRow("visitors", i, { name: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.organization")} value={row.organization} onChange={(e) => updateRow("visitors", i, { organization: e.target.value })} />
            <Input className={inputS} placeholder={t("dailyReport.purpose")} value={row.purpose} onChange={(e) => updateRow("visitors", i, { purpose: e.target.value })} />
          </Row>
        ))}
      </RowCard>

      <Card>
        <CardHeader title={t("dailyReport.photos")} />
        <div className="flex flex-wrap items-center gap-2">
          <FileUploadButton label={t("common.upload")} onUploaded={(f) => set("file_ids", [...form.file_ids, f.id])} />
          {form.file_ids.length > 0 && (
            <Badge tone="blue">{t("common.attachmentsCount", { count: form.file_ids.length })}</Badge>
          )}
        </div>
      </Card>
    </div>
  );
}
