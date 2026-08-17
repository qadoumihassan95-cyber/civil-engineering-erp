
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cookies } from "next/headers";
import { users, sessions } from "@/db/schema";
import { getDb } from "@/db";
import { api, ok } from "@/server/api/route";
import { signSession, setSessionCookie, setCsrfCookie, newCsrfToken } from "@/server/auth/session";
import { newId } from "@/server/lib/ids";

const localeSchema = z.object({ locale: z.enum(["en", "ar"]) });

export const POST = api(async (req, meta) => {
  const body = await req.json().catch(() => ({}));
  const data = localeSchema.parse(body);
  const { db } = getDb();
  await db.update(users).set({ locale: data.locale, updated_at: new Date().toISOString() }).where(eq(users.id, meta.user.id));

  const store = await cookies();
  store.set("locale", data.locale, { path: "/", maxAge: 31536000, sameSite: "lax" });

  const sessionId = newId();
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  await db.insert(sessions).values({ id: sessionId, user_id: meta.user.id, expires_at: expiresAt });
  const token = await signSession({
    sub: meta.user.id,
    sid: sessionId,
    role: meta.user.role,
    locale: data.locale,
    name: meta.user.name,
    email: meta.user.email,
  });
  await setSessionCookie(token);
  const csrf = newCsrfToken();
  await setCsrfCookie(csrf);
  return ok({ locale: data.locale, csrf });
});
