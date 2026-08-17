import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, type AuthUser } from "@/server/auth/context";

import { makeCtx, type Ctx } from "@/server/services/ctx";
import { readCsrfCookie } from "@/server/auth/session";
import { AppError } from "@/server/lib/errors";
import type { Permission } from "@/server/auth/rbac";
import { hasPermission } from "@/server/auth/rbac";

export interface ApiMeta {
  user: AuthUser;
  ctx: Ctx;
}

type Handler = (req: NextRequest, meta: ApiMeta, params: Record<string, string>) => Promise<NextResponse | Response>;

export function api(
  handler: Handler,
  opts: { mutate?: boolean; parse?: z.ZodType; csrf?: boolean; auth?: boolean; permission?: Permission | Permission[] } = {},
) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
    const params = await routeCtx.params;
    try {
      if (opts.csrf !== false && !["GET", "HEAD"].includes(req.method)) {
        const cookieToken = await readCsrfCookie();
        const headerToken = req.headers.get("x-csrf-token");
        if (!cookieToken || !headerToken || cookieToken !== headerToken) {
          throw new AppError("FORBIDDEN", "Invalid CSRF token");
        }
      }
      let user: AuthUser | null = null;
      if (opts.auth !== false) {
        user = await getAuthUser();
        if (!user) {
          throw new AppError("UNAUTHORIZED", "Authentication required");
        }
      }
      const ctx = user ? makeCtx(user) : null;
      if (user && opts.permission && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
        const perms = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
        if (!perms.some((p) => hasPermission(user.role, p))) {
          throw new AppError("FORBIDDEN", `Missing permission: ${perms.join(" or ")}`);
        }
      }
      if (opts.parse && ["POST", "PATCH", "PUT"].includes(req.method)) {
        const body = await req.json().catch(() => null);
        (req as NextRequest & { __body: unknown }).__body = body;
        (req as NextRequest & { __schema: z.ZodType }).__schema = opts.parse;
      }
      return await handler(req, { user: user!, ctx: ctx! }, params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code, i18nKey: e.i18nKey, params: e.params },
      { status: e.status },
    );
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: e.issues[0]?.message ?? "Invalid input", code: "VALIDATION", i18nKey: "errors.validation" },
      { status: 400 },
    );
  }
  console.error("Unhandled API error:", e);
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL", i18nKey: "errors.generic" },
    { status: 500 },
  );
}

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function parsed<T>(req: NextRequest): T {
  const r = req as NextRequest & { __body: unknown; __schema: z.ZodType };
  const res = r.__schema.safeParse(r.__body);
  if (!res.success) {
    throw new AppError("VALIDATION", res.error.issues[0]?.message ?? "Invalid input", {
      i18nKey: "errors.validation",
      params: { field: res.error.issues[0]?.path?.join(".") ?? "" },
    });
  }
  return res.data as T;
}

export function csvResponse(text: string, filename: string): NextResponse {
  return new NextResponse("\uFEFF" + text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function noCache(_req: NextRequest): boolean {
  return false;
}
