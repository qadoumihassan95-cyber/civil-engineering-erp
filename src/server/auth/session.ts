import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { newId } from "@/server/lib/ids";

export const SESSION_COOKIE = "erp_session";
export const CSRF_COOKIE = "erp_csrf";
const SESSION_TTL_HOURS = 12;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  sub: string;
  sid: string;
  role: string;
  locale: string;
  name: string;
  email: string;
}

export async function signSession(payload: Omit<SessionPayload, "sid"> & { sid: string }): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub),
      sid: String(payload.sid),
      role: String(payload.role),
      locale: String(payload.locale ?? "en"),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

export function newCsrfToken(): string {
  return newId() + newId().replace(/-/g, "");
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function setCsrfCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

export async function readCsrfCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CSRF_COOKIE)?.value;
}
