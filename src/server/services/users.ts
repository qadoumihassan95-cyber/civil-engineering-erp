import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { users, projectMembers, projects, sessions } from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, validation } from "@/server/lib/errors";
import { requirePermission, hasProjectAccess } from "@/server/auth/context";
import { hashPassword } from "@/server/auth/password";
import { newId } from "@/server/lib/ids";

export const createUserSchema = z.object({
  email: z.string().email().max(190),
  name: z.string().min(2).max(120),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum([
    "super_admin",
    "owner",
    "general_manager",
    "project_manager",
    "site_engineer",
    "qa_qc",
    "quantity_surveyor",
    "storekeeper",
    "accountant",
    "auditor",
    "viewer",
  ]),
  password: z.string().min(8).max(128),
  is_active: z.boolean().default(true),
  project_ids: z.array(z.string().uuid()).default([]),
});

export const updateUserSchema = z.object({
  email: z.string().email().max(190).optional(),
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(createUserSchema.shape.role.options).optional(),
  password: z.string().min(8).max(128).optional(),
  is_active: z.boolean().optional(),
  project_ids: z.array(z.string().uuid()).optional(),
});

export async function listUsers(ctx: Ctx) {
  requirePermission(ctx.actor, "user:manage");
  return ctx.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      is_active: users.is_active,
      locale: users.locale,
      last_login_at: users.last_login_at,
      created_at: users.created_at,
    })
    .from(users)
    .orderBy(asc(users.name));
}

export async function getUser(ctx: Ctx, id: string) {
  requirePermission(ctx.actor, "user:manage");
  const [user] = await ctx.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      is_active: users.is_active,
      locale: users.locale,
      last_login_at: users.last_login_at,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) throw new AppError("NOT_FOUND", "User not found", { i18nKey: "errors.notFound" });
  const memberships = await ctx.db
    .select({ project_id: projectMembers.project_id, code: projects.code, name: projects.name })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.project_id))
    .where(eq(projectMembers.user_id, id));
  return { ...user, memberships };
}

export async function createUser(ctx: Ctx, input: z.infer<typeof createUserSchema>) {
  requirePermission(ctx.actor, "user:manage");
  const data = createUserSchema.parse(input);
  const [existing] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()))
    .limit(1);
  if (existing) validation("Email already registered", { i18nKey: "errors.emailTaken" });
  const id = newId();
  const passwordHash = await hashPassword(data.password);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      email: data.email.toLowerCase(),
      name: data.name,
      phone: data.phone ?? null,
      role: data.role,
      password_hash: passwordHash,
      is_active: data.is_active,
    });
    if (data.project_ids.length) {
      await tx.insert(projectMembers).values(
        data.project_ids.map((pid) => ({ project_id: pid, user_id: id })),
      );
    }
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "created",
      entityType: "user",
      entityId: id,
      after: { email: data.email, name: data.name, role: data.role },
    });
  });
  return { id };
}

export async function updateUser(ctx: Ctx, id: string, input: z.infer<typeof updateUserSchema>) {
  requirePermission(ctx.actor, "user:manage");
  const data = updateUserSchema.parse(input);
  const [existing] = await ctx.db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw new AppError("NOT_FOUND", "User not found", { i18nKey: "errors.notFound" });

  if (id === ctx.actor.id && data.role && data.role !== existing.role) {
    throw new AppError("SEPARATION_OF_DUTIES", "You cannot change your own role", {
      i18nKey: "errors.selfApproval",
    });
  }
  if (id === ctx.actor.id && data.is_active === false) {
    throw new AppError("SEPARATION_OF_DUTIES", "You cannot deactivate your own account", {
      i18nKey: "errors.selfApproval",
    });
  }

  await ctx.db.transaction(async (tx) => {
    const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.email) set.email = data.email.toLowerCase();
    if (data.name) set.name = data.name;
    if (data.phone !== undefined) set.phone = data.phone;
    if (data.role) set.role = data.role;
    if (data.is_active !== undefined) set.is_active = data.is_active;
    if (data.password) set.password_hash = await hashPassword(data.password);
    if (Object.keys(set).length > 1) {
      await tx.update(users).set(set as never).where(eq(users.id, id));
      if (data.password || data.is_active === false) {
        await tx.update(sessions).set({ revoked_at: new Date().toISOString() }).where(eq(sessions.user_id, id));
      }
    }
    if (data.project_ids) {
      await tx.delete(projectMembers).where(eq(projectMembers.user_id, id));
      if (data.project_ids.length) {
        await tx.insert(projectMembers).values(
          data.project_ids.map((pid) => ({ project_id: pid, user_id: id })),
        );
      }
    }
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "user",
      entityId: id,
      before: { email: existing.email, role: existing.role, is_active: existing.is_active },
      after: { ...data, password: data.password ? "***" : undefined },
    });
  });
}

export async function updateOwnLocale(ctx: Ctx, locale: "en" | "ar") {
  if (!["en", "ar"].includes(locale)) validation("Invalid locale");
  await ctx.db
    .update(users)
    .set({ locale, updated_at: new Date().toISOString() })
    .where(eq(users.id, ctx.actor.id));
}

export async function userProjectIds(ctx: Ctx, userId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ project_id: projectMembers.project_id })
    .from(projectMembers)
    .where(eq(projectMembers.user_id, userId));
  return rows.map((r) => r.project_id);
}

export async function canUserAccessProject(ctx: Ctx, userId: string, projectId: string): Promise<boolean> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;
  return hasProjectAccess(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      phone: user.phone,
    },
    projectId,
  );
}
