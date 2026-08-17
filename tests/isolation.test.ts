import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, mkBoqItem, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import { getProject, computeProjectProgress, listVisibleProjects } from "@/server/services/projects";
import { listWirs, createWirDraft, submitWir, startWirReview, decideWir } from "@/server/services/wir";
import { listExpenses } from "@/server/services/expenses";

let db: Db;
let engineerA: Awaited<ReturnType<typeof mkUser>>;
let engineerB: Awaited<ReturnType<typeof mkUser>>;
let qaqc: Awaited<ReturnType<typeof mkUser>>;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  db = await setupTestDb();
  engineerA = await mkUser(db, "site_engineer", "Eng A");
  engineerB = await mkUser(db, "site_engineer", "Eng B");
  qaqc = await mkUser(db, "qa_qc", "QA");
  projectA = await mkProject(db, { code: "ISO-A", memberIds: [engineerA.id, qaqc.id] });
  projectB = await mkProject(db, { code: "ISO-B", memberIds: [engineerB.id, qaqc.id] });
});

describe("project isolation", () => {
  it("user cannot view a project they are not a member of", async () => {
    const err = await expectError(() => getProject(ctxFor(db, engineerA), projectB));
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("user cannot create a WIR on a foreign project", async () => {
    const itemB = await mkBoqItem(db, projectB, { code: "ISO-B-1" });
    const err = await expectError(() =>
      createWirDraft(ctxFor(db, engineerA), projectB, {
        boq_item_id: itemB.id,
        location: "X",
        submitted_qty: "1",
        file_ids: [],
      }),
    );
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("WIR list only returns the requested project's WIRs", async () => {
    const itemA = await mkBoqItem(db, projectA, { code: "ISO-A-1" });
    const itemB = await mkBoqItem(db, projectB, { code: "ISO-B-2" });
    const wa = await createWirDraft(ctxFor(db, engineerA), projectA, { boq_item_id: itemA.id, location: "A", submitted_qty: "1", file_ids: [] });
    const wb = await createWirDraft(ctxFor(db, engineerB), projectB, { boq_item_id: itemB.id, location: "B", submitted_qty: "1", file_ids: [] });
    await submitWir(ctxFor(db, engineerA), projectA, wa.id);
    await submitWir(ctxFor(db, engineerB), projectB, wb.id);

    const listA = await listWirs(ctxFor(db, engineerA), projectA);
    expect(listA.map((w) => w.id)).toContain(wa.id);
    expect(listA.map((w) => w.id)).not.toContain(wb.id);
  });

  it("expense list is scoped to the user's projects for non-global roles", async () => {
    const { createExpense } = await import("@/server/services/expenses");
    await createExpense(ctxFor(db, engineerB), {
      project_id: projectB,
      expense_date: "2025-08-01",
      amount: "100.000",
      tax_amount: "0",
      payment_method: "cash",
      currency: "JOD",
      file_ids: [],
    });
    const { rows } = await listExpenses(ctxFor(db, engineerA), {});
    expect(rows.every((r) => r.project_id !== projectB)).toBe(true);
  });

  it("listVisibleProjects only returns the user's projects", async () => {
    const visible = await listVisibleProjects(ctxFor(db, engineerA));
    expect(visible.map((p) => p.id)).toContain(projectA);
    expect(visible.map((p) => p.id)).not.toContain(projectB);
  });
});

describe("progress & financial calculations", () => {
  it("progress is value-weighted from approved WIR quantities", async () => {
    const projectId = await mkProject(db, { code: "PROG-1", memberIds: [engineerA.id, qaqc.id] });
    const i1 = await mkBoqItem(db, projectId, { code: "P-1", qty: "100", rate: "1000", unit: "m3" });
    const _i2 = await mkBoqItem(db, projectId, { code: "P-2", qty: "100", rate: "100", unit: "m3" });

    const w = await createWirDraft(ctxFor(db, engineerA), projectId, {
      boq_item_id: i1.id, location: "L", submitted_qty: "50", file_ids: [],
    });
    await submitWir(ctxFor(db, engineerA), projectId, w.id);
    await startWirReview(ctxFor(db, qaqc), projectId, w.id);
    await decideWir(ctxFor(db, qaqc), projectId, w.id, { decision: "approved" });

    const progress = await computeProjectProgress(ctxFor(db, engineerA), projectId);
    // approved value = 50 * 1000 = 50000; contract value = 100000 + 10000 = 110000
    expect(parseFloat(progress.approvedValue)).toBeCloseTo(50000, 2);
    expect(parseFloat(progress.progressPercent)).toBeCloseTo((50000 / 110000) * 100, 2);
  });

  it("BOQ variation cannot reduce contract quantity below approved quantity", async () => {
    const projectId = await mkProject(db, { code: "VAR-1", memberIds: [engineerA.id, qaqc.id] });
    const qs = await mkUser(db, "quantity_surveyor", "QS");
    await db.insert((await import("@/db/schema")).projectMembers).values({ project_id: projectId, user_id: qs.id });
    const item = await mkBoqItem(db, projectId, { code: "V-1", qty: "100", rate: "10", unit: "m3" });
    const w = await createWirDraft(ctxFor(db, engineerA), projectId, {
      boq_item_id: item.id, location: "L", submitted_qty: "60", file_ids: [],
    });
    await submitWir(ctxFor(db, engineerA), projectId, w.id);
    await startWirReview(ctxFor(db, qaqc), projectId, w.id);
    await decideWir(ctxFor(db, qaqc), projectId, w.id, { decision: "approved" });

    const { applyVariation } = await import("@/server/services/boq");
    const err = await expectError(() =>
      applyVariation(ctxFor(db, qs), projectId, item.id, { contract_qty: "40" }),
    );
    expect(errorCode(err)).toBe("QUANTITY_EXCEEDED");
  });
});
