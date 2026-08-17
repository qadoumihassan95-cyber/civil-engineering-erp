
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { users, sessions } from "@/db/schema";
import { getDb } from "@/db";
import { api, ok } from "@/server/api/route";
import { verifyPassword } from "@/server/auth/password";
import { signSession, setSessionCookie, setCsrfCookie, newCsrfToken } from "@/server/auth/session";
import { loginRateLimitKey, checkRateLimit, resetRateLimit } from "@/server/auth/rateLimit";
import { newId } from "@/server/lib/ids";
import { audit } from "@/server/services/audit";
import { makeCtx } from "@/server/services/ctx";
import { AppError } from "@/server/lib/errors";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const POST = api(
  async (req) => {
    const body = await req.json().catch(() => null);
    const data = loginSchema.safeParse(body);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const email = typeof body?.email === "string" ? body.email : "";
    const rl = checkRateLimit(loginRateLimitKey(email, ip), 8, 15 * 60 * 1000);
    if (!rl.allowed) {
      const minutes = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
      throw new AppError("RATE_LIMITED", "Too many attempts. Try again later.", {
        i18nKey: "auth.tooManyAttempts",
        params: { minutes },
      });
    }

    if (!data.success) {
      throw new AppError("VALIDATION", "Invalid email or password", {
        i18nKey: "auth.invalidCredentials",
      });
    }

    const { db } = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.data.email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
      if (n === 0) {
        throw new AppError("VALIDATION", "No user accounts found — the database has not been seeded.", {
          i18nKey: "auth.noAccounts",
        });
      }
    }

    const valid = user && (await verifyPassword(data.data.password, user.password_hash));
    if (!user || !valid) {
      throw new AppError("VALIDATION", "Invalid email or password", {
        i18nKey: "auth.invalidCredentials",
      });
    }
    if (!user.is_active) {
      throw new AppError("FORBIDDEN", "Account disabled", { i18nKey: "auth.accountDisabled" });
    }

    resetRateLimit(loginRateLimitKey(email, ip));

    const sessionId = newId();
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    await db.insert(sessions).values({
      id: sessionId,
      user_id: user.id,
      expires_at: expiresAt,
    });
    await db
      .update(users)
      .set({ last_login_at: new Date().toISOString() })
      .where(eq(users.id, user.id));

    const token = await signSession({
      sub: user.id,
      sid: sessionId,
      role: user.role,
      locale: user.locale,
      name: user.name,
      email: user.email,
    });
    await setSessionCookie(token);
    const csrf = newCsrfToken();
    await setCsrfCookie(csrf);
    const store = await (await import("next/headers")).cookies();
    store.set("locale", user.locale === "ar" ? "ar" : "en", { path: "/", maxAge: 31536000, sameSite: "lax" });

    await audit(makeCtx({ id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale, phone: user.phone }), {
      action: "login",
      entityType: "user",
      entityId: user.id,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        locale: user.locale,
        phone: user.phone,
      },
      csrf,
    });
  },
  { csrf: false, auth: false },
);
