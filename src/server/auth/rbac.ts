import type { UserRole } from "@/db/schema";

export const ALL_PERMISSIONS = [
  "project:create",
  "project:update",
  "project:settings",
  "member:manage",
  "boq:manage",
  "boq:certify",
  "wir:create",
  "wir:review",
  "wir:approve",
  "dr:create",
  "dr:approve",
  "inventory:transact",
  "inventory:adjust",
  "expense:create",
  "expense:approve",
  "document:upload",
  "document:manage",
  "user:manage",
  "audit:view",
  "financial:view",
  "export:use",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  owner: [...ALL_PERMISSIONS],
  general_manager: [
    "project:create",
    "project:update",
    "project:settings",
    "member:manage",
    "wir:create",
    "wir:review",
    "wir:approve",
    "dr:create",
    "dr:approve",
    "expense:create",
    "expense:approve",
    "document:upload",
    "document:manage",
    "audit:view",
    "financial:view",
    "export:use",
  ],
  project_manager: [
    "project:update",
    "boq:manage",
    "boq:certify",
    "wir:create",
    "wir:review",
    "wir:approve",
    "dr:create",
    "dr:approve",
    "expense:create",
    "document:upload",
    "document:manage",
    "audit:view",
    "financial:view",
    "export:use",
  ],
  site_engineer: [
    "wir:create",
    "dr:create",
    "expense:create",
    "document:upload",
  ],
  qa_qc: [
    "wir:review",
    "wir:approve",
    "dr:create",
    "document:upload",
  ],
  quantity_surveyor: [
    "boq:manage",
    "boq:certify",
    "financial:view",
    "export:use",
  ],
  storekeeper: [
    "inventory:transact",
    "inventory:adjust",
    "document:upload",
    "export:use",
  ],
  accountant: [
    "expense:create",
    "expense:approve",
    "financial:view",
    "audit:view",
    "document:upload",
    "export:use",
  ],
  auditor: [
    "audit:view",
    "financial:view",
    "export:use",
  ],
  viewer: [],
};

/** Roles that can access all projects without explicit membership. */
export const GLOBAL_PROJECT_ROLES: readonly UserRole[] = [
  "super_admin",
  "owner",
  "general_manager",
  "auditor",
];

export function hasPermission(role: UserRole | string | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role as UserRole] ?? []).includes(perm);
}

export function rolePermissions(role: UserRole | string): readonly Permission[] {
  return ROLE_PERMISSIONS[role as UserRole] ?? [];
}

export function isGlobalProjectRole(role: UserRole | string | undefined): boolean {
  return !!role && (GLOBAL_PROJECT_ROLES as readonly string[]).includes(role);
}
