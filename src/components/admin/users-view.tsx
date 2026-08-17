"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, Input, Field, Select, Badge } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { PageHeader, EmptyState } from "@/components/ui/surfaces";
import { ROLES } from "@/components/roles";
import { formatDateTime } from "@/server/i18n";

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

export function UsersView({
  locale,
  rows,
  projects,
}: {
  locale: string;
  rows: UserRow[];
  projects: { id: string; code: string; name: string }[];
}) {
  const { t, api, toast } = useApp();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow & { memberships: { project_id: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "viewer",
    password: "",
    is_active: true,
    project_ids: [] as string[],
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [rows, search]);

  function openCreate() {
    setForm({ name: "", email: "", phone: "", role: "site_engineer", password: "", is_active: true, project_ids: [] });
    setEditUser(null);
    setCreateOpen(true);
  }

  async function openEdit(id: string) {
    const res = await api.call<UserRow & { memberships: { project_id: string }[] }>("GET", `/api/admin/users/${id}`);
    setEditUser(res);
    setForm({
      name: res.name,
      email: res.email,
      phone: res.phone ?? "",
      role: res.role,
      password: "",
      is_active: res.is_active,
      project_ids: res.memberships.map((m) => m.project_id),
    });
    setCreateOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      if (editUser) {
        await api.call("PATCH", `/api/admin/users/${editUser.id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          role: form.role,
          is_active: form.is_active,
          project_ids: form.project_ids,
          password: form.password || undefined,
        });
      } else {
        await api.call("POST", "/api/admin/users", form);
      }
      toast.success(t("common.saved"));
      setCreateOpen(false);
      router.refresh();
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
        title={t("admin.users")}
        actions={<Button onClick={openCreate}>+ {t("admin.newUser")}</Button>}
      />

      <div className="mb-4">
        <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("admin.noUsers")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">{t("admin.name")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("admin.email")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("admin.role")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("admin.lastLogin")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.status")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">{u.name}</td>
                  <td className="px-4 py-2.5 text-xs" dir="ltr">{u.email}</td>
                  <td className="px-4 py-2.5"><Badge tone="blue">{t(`admin.role${roleKey(u.role)}`)}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{u.last_login_at ? formatDateTime(u.last_login_at, locale) : "—"}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Badge tone={u.is_active ? "green" : "gray"}>{u.is_active ? t("common.active") : t("common.inactive")}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    <button className="text-xs font-semibold text-primary-600 hover:underline" onClick={() => openEdit(u.id)}>
                      {t("common.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editUser ? t("admin.editUser") : t("admin.newUser")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} loading={busy} disabled={!form.name || !form.email || (!editUser && !form.password)}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("admin.name")} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("admin.email")} required>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t("admin.phone")}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t("admin.role")}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{t(`admin.role${roleKey(r)}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("admin.password")} required={!editUser} hint={editUser ? t("admin.passwordHint") : undefined}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t("admin.memberships")}>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={form.project_ids.includes(p.id)}
                    onChange={(e) => {
                      const ids = e.target.checked ? [...form.project_ids, p.id] : form.project_ids.filter((x) => x !== p.id);
                      setForm({ ...form, project_ids: ids });
                    }}
                  />
                  <span className="font-mono text-xs">{p.code}</span>
                  <span className="text-xs">{p.name}</span>
                </label>
              ))}
            </div>
          </Field>
          {editUser && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              {t("admin.active")}
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}

function roleKey(role: string): string {
  const map: Record<string, string> = {
    super_admin: "SuperAdmin",
    owner: "Owner",
    general_manager: "GeneralManager",
    project_manager: "ProjectManager",
    site_engineer: "SiteEngineer",
    qa_qc: "QaQc",
    quantity_surveyor: "QuantitySurveyor",
    storekeeper: "Storekeeper",
    accountant: "Accountant",
    auditor: "Auditor",
    viewer: "Viewer",
  };
  return map[role] ?? role;
}
