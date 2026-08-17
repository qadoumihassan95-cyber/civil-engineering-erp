import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, mkBoqItem, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import { hasPermission, isGlobalProjectRole, GLOBAL_PROJECT_ROLES, type Permission } from "@/server/auth/rbac";
import { createWirDraft } from "@/server/services/wir";
import { createExpense } from "@/server/services/expenses";
import { createProject } from "@/server/services/projects";
import { listAudit } from "@/server/services/audit";

let db: Db;

beforeAll(async () => {
  db = await setupTestDb();
});

describe("RBAC permission matrix", () => {
  it("site_engineer can create WIRs but cannot approve them", () => {
    expect(hasPermission("site_engineer", "wir:create")).toBe(true);
    expect(hasPermission("site_engineer", "wir:approve")).toBe(false);
  });

  it("qa_qc can review/approve WIRs but cannot create them", () => {
    expect(hasPermission("qa_qc", "wir:create")).toBe(false);
    expect(hasPermission("qa_qc", "wir:review")).toBe(true);
    expect(hasPermission("qa_qc", "wir:approve")).toBe(true);
  });

  it("storekeeper has inventory permissions but no financial view", () => {
    expect(hasPermission("storekeeper", "inventory:transact")).toBe(true);
    expect(hasPermission("storekeeper", "inventory:adjust")).toBe(true);
    expect(hasPermission("storekeeper", "financial:view")).toBe(false);
  });

  it("accountant can approve expenses", () => {
    expect(hasPermission("accountant", "expense:approve")).toBe(true);
    expect(hasPermission("accountant", "expense:create")).toBe(true);
  });

  it("viewer has no write permissions", () => {
    const perms: Permission[] = ["project:create", "boq:manage", "wir:create", "inventory:transact", "expense:create"];
    for (const p of perms) expect(hasPermission("viewer", p)).toBe(false);
  });

  it("auditor is a global project role with audit view", () => {
    expect(isGlobalProjectRole("auditor")).toBe(true);
    expect(hasPermission("auditor", "audit:view")).toBe(true);
  });

  it("project_manager is not a global project role", () => {
    expect(GLOBAL_PROJECT_ROLES).not.toContain("project_manager");
  });
});

describe("server-side authorization enforcement", () => {
  it("a viewer cannot create a WIR even with a valid payload", async () => {
    const viewer = await mkUser(db, "viewer");
    const engineer = await mkUser(db, "site_engineer");
    const projectId = await mkProject(db, { memberIds: [viewer.id, engineer.id] });
    const item = await mkBoqItem(db, projectId);
    const err = await expectError(() =>
      createWirDraft(ctxFor(db, viewer), projectId, {
        boq_item_id: item.id,
        location: "Zone A",
        submitted_qty: "10",
        file_ids: [],
      }),
    );
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("a site_engineer cannot create a project", async () => {
    const engineer = await mkUser(db, "site_engineer");
    const err = await expectError(() =>
      createProject(ctxFor(db, engineer), {
        code: "X-1",
        name: "X",
        contract_value: "100",
        currency: "JOD",
      }),
    );
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("a viewer cannot read the audit trail", async () => {
    const viewer = await mkUser(db, "viewer");
    const err = await expectError(() => listAudit(ctxFor(db, viewer), {}));
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("a site_engineer cannot approve expenses (separation of duties by role)", async () => {
    const engineer = await mkUser(db, "site_engineer");
    const accountant = await mkUser(db, "accountant");
    const projectId = await mkProject(db, { memberIds: [engineer.id, accountant.id] });
    const exp = await createExpense(ctxFor(db, engineer), {
      project_id: projectId,
      expense_date: "2025-08-01",
      amount: "500.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    await import("@/server/services/expenses").then((m) => m.submitExpense(ctxFor(db, engineer), exp.id));
    const err = await expectError(() =>
      import("@/server/services/expenses").then((m) =>
        m.decideExpense(ctxFor(db, engineer), exp.id, { decision: "approved" }),
      ),
    );
    expect(errorCode(err)).toBe("FORBIDDEN");
  });
});
