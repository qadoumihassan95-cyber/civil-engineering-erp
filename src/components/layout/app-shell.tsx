"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useApp, useLocale } from "@/components/providers";
import { hasPermission } from "@/server/auth/rbac";

interface NavLabels {
  dashboard: string;
  projects: string;
  inventory: string;
  stock: string;
  receipts: string;
  issues: string;
  transfers: string;
  returns: string;
  adjustments: string;
  materials: string;
  suppliers: string;
  warehouses: string;
  expenses: string;
  documents: string;
  reports: string;
  admin: string;
  users: string;
  audit: string;
  searchPlaceholder: string;
  logout: string;
  language: string;
  menu: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  locale: string;
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z",
  projects: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
  inventory: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  expenses: "M12 2v20M17 6.5c0-2-2.2-3-4-3s-4 1-4 3 1.8 2.5 4 3 4 1.5 4 3.5-1.8 3-4 3-4-1-4-3",
  documents: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15h6M9 11h6",
  reports: "M3 3v18h18M8 17V9M13 17V5M18 17v-7",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  audit: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
};

function NavItem({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  const d = ICONS[icon] ?? icon;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary-50 text-primary-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon d={d} className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppShell({ children, user, navLabels }: { children: ReactNode; user: User; navLabels: NavLabels }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { locale, setLocale } = useLocale();
  const { api, t } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const canUsers = hasPermission(user.role, "user:manage");
  const canAudit = hasPermission(user.role, "audit:view");
  const canInventory = hasPermission(user.role, "inventory:transact") || hasPermission(user.role, "inventory:adjust") || hasPermission(user.role, "financial:view");

  const isActive = (prefix: string) => pathname.startsWith(prefix);

  async function logout() {
    try {
      await api.call("POST", "/api/auth/logout");
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      <NavItem href="/" icon="dashboard" label={navLabels.dashboard} active={pathname === "/"} />
      <NavItem href="/projects" icon="projects" label={navLabels.projects} active={isActive("/projects")} />

      <div className="mt-4 mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {navLabels.inventory}
      </div>
      {canInventory && (
        <>
          <NavItem href="/inventory/stock" icon="inventory" label={navLabels.stock} active={isActive("/inventory/stock")} />
          <NavItem href="/inventory/receipts" icon="documents" label={navLabels.receipts} active={isActive("/inventory/receipts")} />
          <NavItem href="/inventory/issues" icon="documents" label={navLabels.issues} active={isActive("/inventory/issues")} />
          <NavItem href="/inventory/transfers" icon="documents" label={navLabels.transfers} active={isActive("/inventory/transfers")} />
          <NavItem href="/inventory/returns" icon="documents" label={navLabels.returns} active={isActive("/inventory/returns")} />
          <NavItem href="/inventory/adjustments" icon="documents" label={navLabels.adjustments} active={isActive("/inventory/adjustments")} />
          <NavItem href="/inventory/materials" icon="inventory" label={navLabels.materials} active={isActive("/inventory/materials")} />
          <NavItem href="/inventory/suppliers" icon="users" label={navLabels.suppliers} active={isActive("/inventory/suppliers")} />
          <NavItem href="/inventory/warehouses" icon="inventory" label={navLabels.warehouses} active={isActive("/inventory/warehouses")} />
        </>
      )}

      <div className="mt-4 mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {navLabels.expenses}
      </div>
      <NavItem href="/expenses" icon="expenses" label={navLabels.expenses} active={isActive("/expenses")} />
      <NavItem href="/documents" icon="documents" label={navLabels.documents} active={isActive("/documents")} />
      <NavItem href="/reports" icon="reports" label={navLabels.reports} active={isActive("/reports")} />

      {(canUsers || canAudit) && (
        <>
          <div className="mt-4 mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {navLabels.admin}
          </div>
          {canUsers && <NavItem href="/admin/users" icon="users" label={navLabels.users} active={isActive("/admin/users")} />}
          {canAudit && <NavItem href="/admin/audit" icon="audit" label={navLabels.audit} active={isActive("/admin/audit")} />}
        </>
      )}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-700 text-white">
        <Icon d="M3 21h18M5 21V7l7-4 7 4v14" className="h-4.5 w-4.5" />
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900">{t("app.name")}</div>
        <div className="text-[10px] text-slate-500">{t("app.tagline")}</div>
      </div>
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 start-0 z-40 hidden w-60 flex-col border-e border-slate-200 bg-white lg:flex">
        {brand}
        {nav}
        <div className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-800">{user.name}</div>
              <div className="truncate text-[10px] text-slate-500">{t(`admin.role${roleKey(user.role)}`)}</div>
            </div>
            <button onClick={logout} title={navLabels.logout} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
              <Icon d={ICONS.logout} className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            {brand}
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:ms-60">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={navLabels.menu}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <form onSubmit={submitSearch} className="relative hidden max-w-md flex-1 sm:block">
            <Icon d={ICONS.search} className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={navLabels.searchPlaceholder}
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm placeholder:text-slate-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </form>
          <div className="flex-1 sm:hidden" />
          <Link href="/search" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 sm:hidden">
            <Icon d={ICONS.search} className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            className="hidden items-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 sm:inline-flex"
            title={navLabels.language}
          >
            {locale === "ar" ? "English" : "العربية"}
          </button>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="hidden text-sm font-medium text-slate-700 md:block">{user.name}</span>
            </button>
            {userMenuOpen && (
              <div className="animate-fade-in absolute end-0 z-40 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2">
                  <div className="text-xs font-semibold text-slate-800">{user.name}</div>
                  <div className="text-[11px] text-slate-500">{user.email}</div>
                </div>
                <button
                  onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{navLabels.language}</span>
                  <span className="text-xs font-bold text-primary-700">{locale === "ar" ? "English" : "العربية"}</span>
                </button>
                <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-slate-50">
                  <Icon d={ICONS.logout} className="h-4 w-4" />
                  {navLabels.logout}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
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
