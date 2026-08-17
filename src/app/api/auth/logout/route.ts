
import { eq } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { getDb } from "@/db";
import { api, ok } from "@/server/api/route";
import { clearSessionCookies, SESSION_COOKIE, verifySession } from "@/server/auth/session";
import { audit } from "@/server/services/audit";
import { makeCtx } from "@/server/services/ctx";

export const POST = api(async (req, meta) => {
  const { db } = getDb();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const payload = await verifySession(cookie);
    if (payload?.sid) {
      await db.update(sessions).set({ revoked_at: new Date().toISOString() }).where(eq(sessions.id, payload.sid));
    }
  }
  await audit(makeCtx(meta.user), { action: "logout", entityType: "user", entityId: meta.user.id });
  await clearSessionCookies();
  return ok({ ok: true });
});
