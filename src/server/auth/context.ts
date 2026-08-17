import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { users, sessions, projectMembers, type UserRole } from "@/db/schema";
import { verifySession, SESSION_COOKIE } from "./session";
import { hasPermission, isGlobalProjectRole, type Permission } from "./rbac";
import { AppError } from "@/server/lib/errors";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  locale: string;
  phone: string | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const { db } = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || !user.is_active) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, payload.sid), eq(sessions.user_id, user.id)))
    .limit(1);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    phone: user.phone,
  };
}

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
  return user;
}

export function requirePermission(user: AuthUser | null, perm: Permission): AuthUser {
  const u = requireUser(user);
  if (!hasPermission(u.role, perm)) {
    throw new AppError("FORBIDDEN", `Missing permission: ${perm}`);
  }
  return u;
}

export function requireAnyPermission(user: AuthUser | null, perms: Permission[]): AuthUser {
  const u = requireUser(user);
  if (!perms.some((p) => hasPermission(u.role, p))) {
    throw new AppError("FORBIDDEN", `Missing permission: ${perms.join(" or ")}`);
  }
  return u;
}

export async function hasProjectAccess(
  user: AuthUser,
  projectId: string,
): Promise<boolean> {
  if (isGlobalProjectRole(user.role)) return true;
  const { db } = getDb();
  const [row] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, user.id)))
    .limit(1);
  return !!row;
}

export async function requireProjectAccess(user: AuthUser | null, projectId: string): Promise<AuthUser> {
  const u = requireUser(user);
  const ok = await hasProjectAccess(u, projectId);
  if (!ok) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
  return u;
}

export async function requireProjectPermission(
  user: AuthUser | null,
  projectId: string,
  perm: Permission,
): Promise<AuthUser> {
  const u = requirePermission(user, perm);
  await requireProjectAccess(u, projectId);
  return u;
}

export async function visibleProjectIds(user: AuthUser): Promise<string[] | null> {
  if (isGlobalProjectRole(user.role)) return null;
  const { db } = getDb();
  const rows = await db
    .select({ project_id: projectMembers.project_id })
    .from(projectMembers)
    .where(eq(projectMembers.user_id, user.id));
  return rows.map((r) => r.project_id);
}

export { isGlobalProjectRole, hasPermission };
