export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "INSUFFICIENT_STOCK"
  | "QUANTITY_EXCEEDED"
  | "SEPARATION_OF_DUTIES"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  i18nKey?: string;
  params?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { i18nKey?: string; params?: Record<string, string | number> },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.i18nKey = opts?.i18nKey;
    this.params = opts?.params;
    this.status = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION: 400,
      CONFLICT: 409,
      INVALID_STATE: 409,
      INSUFFICIENT_STOCK: 422,
      QUANTITY_EXCEEDED: 422,
      SEPARATION_OF_DUTIES: 422,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    }[code];
  }
}

export function notFound(entity = "Record"): never {
  throw new AppError("NOT_FOUND", `${entity} not found`, { i18nKey: "errors.notFound" });
}

export function forbidden(message = "You do not have permission to perform this action"): never {
  throw new AppError("FORBIDDEN", message, { i18nKey: "errors.forbidden" });
}

export function invalidState(
  message: string,
  opts?: { i18nKey?: string; params?: Record<string, string | number> },
): never {
  throw new AppError("INVALID_STATE", message, opts);
}

export function validation(message: string, opts?: { i18nKey?: string; params?: Record<string, string | number> }): never {
  throw new AppError("VALIDATION", message, opts);
}
