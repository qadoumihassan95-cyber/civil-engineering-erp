import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import {
  createExpense,
  submitExpense,
  decideExpense,
  listExpenses,
  deleteExpenseDraft,
  updateExpenseDraft,
} from "@/server/services/expenses";

let db: Db;
let engineer: Awaited<ReturnType<typeof mkUser>>;
let accountant: Awaited<ReturnType<typeof mkUser>>;
let projectId: string;

beforeAll(async () => {
  db = await setupTestDb();
  engineer = await mkUser(db, "site_engineer", "Eng");
  accountant = await mkUser(db, "accountant", "ACC");
  projectId = await mkProject(db, { memberIds: [engineer.id, accountant.id] });
});

describe("expense workflow", () => {
  it("total = amount + tax", async () => {
    const exp = await createExpense(ctxFor(db, engineer), {
      project_id: projectId,
      expense_date: "2025-08-01",
      amount: "100.000",
      tax_amount: "16.000",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    const { rows } = await listExpenses(ctxFor(db, engineer), { projectId });
    const row = rows.find((r) => r.id === exp.id)!;
    expect(row.total).toBe("116.000");
  });

  it("creator cannot approve their own expense (separation of duties)", async () => {
    const exp = await createExpense(ctxFor(db, accountant), {
      project_id: projectId,
      expense_date: "2025-08-02",
      amount: "50.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    await submitExpense(ctxFor(db, accountant), exp.id);
    const err = await expectError(() =>
      decideExpense(ctxFor(db, accountant), exp.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("SEPARATION_OF_DUTIES");
  });

  it("approval by a different approver succeeds and records approver", async () => {
    const exp = await createExpense(ctxFor(db, engineer), {
      project_id: projectId,
      expense_date: "2025-08-03",
      amount: "200.000",
      tax_amount: "32.000",
      payment_method: "bank_transfer",
      currency: "JOD",
      file_ids: [],
    });
    await submitExpense(ctxFor(db, engineer), exp.id);
    await decideExpense(ctxFor(db, accountant), exp.id, { decision: "approved" });
    const { rows } = await listExpenses(ctxFor(db, engineer), { projectId });
    const row = rows.find((r) => r.id === exp.id)!;
    expect(row.status).toBe("approved");
    expect(row.approver_name).toBe("ACC");
  });

  it("rejection requires a comment", async () => {
    const exp = await createExpense(ctxFor(db, engineer), {
      project_id: projectId,
      expense_date: "2025-08-04",
      amount: "10.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    await submitExpense(ctxFor(db, engineer), exp.id);
    const err = await expectError(() =>
      decideExpense(ctxFor(db, accountant), exp.id, { decision: "rejected" }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });

  it("draft can be edited and deleted; submitted cannot", async () => {
    const exp = await createExpense(ctxFor(db, engineer), {
      project_id: projectId,
      expense_date: "2025-08-05",
      amount: "10.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    await updateExpenseDraft(ctxFor(db, engineer), exp.id, {
      project_id: projectId,
      expense_date: "2025-08-05",
      amount: "15.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    await submitExpense(ctxFor(db, engineer), exp.id);
    const editErr = await expectError(() =>
      updateExpenseDraft(ctxFor(db, engineer), exp.id, {
        project_id: projectId,
        expense_date: "2025-08-05",
        amount: "16.000",
        tax_amount: "0",
        payment_method: "cash",
        currency: "JOD",
        file_ids: [],
      }),
    );
    expect(errorCode(editErr)).toBe("INVALID_STATE");
    const delErr = await expectError(() => deleteExpenseDraft(ctxFor(db, engineer), exp.id));
    expect(errorCode(delErr)).toBe("INVALID_STATE");
  });

  it("amount must be non-negative", async () => {
    const err = await expectError(() =>
      createExpense(ctxFor(db, engineer), {
        project_id: projectId,
        expense_date: "2025-08-06",
        amount: "-5.000",
        tax_amount: "0",
        payment_method: "cash",
        currency: "JOD",
        file_ids: [],
      }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });
});
