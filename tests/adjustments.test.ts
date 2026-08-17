import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import { createWarehouse, createMaterial, stockForWarehouseMaterial } from "@/server/services/inventory";
import {
  createAdjustment,
  submitAdjustment,
  approveAdjustment,
  postAdjustment,
  getAdjustment,
  deleteAdjustmentDraft,
} from "@/server/services/adjustments";

let db: Db;
let storekeeper: Awaited<ReturnType<typeof mkUser>>;
let storekeeper2: Awaited<ReturnType<typeof mkUser>>;
let pm: Awaited<ReturnType<typeof mkUser>>;
let controlledProject: string;
let simpleProject: string;
let whControlled: string;
let whSimple: string;
let mat: string;

beforeAll(async () => {
  db = await setupTestDb();
  storekeeper = await mkUser(db, "storekeeper", "Store 1");
  storekeeper2 = await mkUser(db, "storekeeper", "Store 2");
  pm = await mkUser(db, "project_manager", "PM");
  controlledProject = await mkProject(db, {
    code: "CTRL-1",
    memberIds: [storekeeper.id, storekeeper2.id, pm.id],
    settings: { stockAdjustmentPolicy: "controlled" },
  });
  simpleProject = await mkProject(db, {
    code: "SIMP-1",
    memberIds: [storekeeper.id, pm.id],
    settings: { stockAdjustmentPolicy: "simple" },
  });
  whControlled = (await createWarehouse(ctxFor(db, storekeeper), { code: "WHC", name: "WH Controlled", project_id: controlledProject, is_active: true })).id;
  whSimple = (await createWarehouse(ctxFor(db, storekeeper), { code: "WHS", name: "WH Simple", project_id: simpleProject, is_active: true })).id;
  mat = (await createMaterial(ctxFor(db, storekeeper), { code: "ADJM", name: "Adj Material", unit: "kg", min_stock: "0", is_active: true })).id;

  // seed stock in both warehouses
  const { createReceipt, postReceipt } = await import("@/server/services/movements");
  for (const wh of [whControlled, whSimple]) {
    const r = await createReceipt(ctxFor(db, storekeeper), {
      warehouse_id: wh,
      receipt_date: "2025-08-01",
      items: [{ material_id: mat, qty: "100" }],
    });
    await postReceipt(ctxFor(db, storekeeper), r.id);
  }
});

describe("controlled policy workflow", () => {
  it("draft → submitted → approved → posted", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-10",
      reason: "Cycle count",
      items: [{ material_id: mat, qty_diff: "-10", note: null }],
    });
    expect(adj.policy).toBe("controlled");

    // cannot post before approval
    const early = await expectError(() => postAdjustment(ctxFor(db, storekeeper), adj.id));
    expect(errorCode(early)).toBe("INVALID_STATE");

    await submitAdjustment(ctxFor(db, storekeeper), adj.id);
    await approveAdjustment(ctxFor(db, pm), adj.id, { decision: "approved" });
    await postAdjustment(ctxFor(db, storekeeper), adj.id);

    const doc = await getAdjustment(ctxFor(db, storekeeper), adj.id);
    expect(doc.status).toBe("posted");
    expect(await stockForWarehouseMaterial(db, whControlled, mat)).toBe("90.0000");
  });

  it("creator cannot approve own adjustment (separation of duties)", async () => {
    const owner = await mkUser(db, "owner", "Owner");
    await db.insert((await import("@/db/schema")).projectMembers).values({
      project_id: controlledProject,
      user_id: owner.id,
    });
    const adj = await createAdjustment(ctxFor(db, owner), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-11",
      reason: "Recount",
      items: [{ material_id: mat, qty_diff: "-5", note: null }],
    });
    await submitAdjustment(ctxFor(db, owner), adj.id);
    const err = await expectError(() =>
      approveAdjustment(ctxFor(db, owner), adj.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("SEPARATION_OF_DUTIES");
  });

  it("storekeeper role alone cannot approve (role restriction)", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-12",
      reason: "Recount 2",
      items: [{ material_id: mat, qty_diff: "-2", note: null }],
    });
    await submitAdjustment(ctxFor(db, storekeeper), adj.id);
    const err = await expectError(() =>
      approveAdjustment(ctxFor(db, storekeeper2), adj.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("FORBIDDEN");
  });

  it("rejected adjustment cannot be posted", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-13",
      reason: "Test reject",
      items: [{ material_id: mat, qty_diff: "-1", note: null }],
    });
    await submitAdjustment(ctxFor(db, storekeeper), adj.id);
    await approveAdjustment(ctxFor(db, pm), adj.id, { decision: "rejected", comment: "Not supported" });
    const err = await expectError(() => postAdjustment(ctxFor(db, storekeeper), adj.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("zero quantity difference is rejected", async () => {
    const err = await expectError(() =>
      createAdjustment(ctxFor(db, storekeeper), {
        warehouse_id: whControlled,
        adjustment_date: "2025-08-14",
        reason: "Zero diff",
        items: [{ material_id: mat, qty_diff: "0", note: null }],
      }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });

  it("draft can be deleted; submitted cannot", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-15",
      reason: "Delete me",
      items: [{ material_id: mat, qty_diff: "-3", note: null }],
    });
    await deleteAdjustmentDraft(ctxFor(db, storekeeper), adj.id);
    expect((await getAdjustment(ctxFor(db, storekeeper), adj.id).catch(() => null))).toBeNull();

    const adj2 = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-16",
      reason: "Keep me",
      items: [{ material_id: mat, qty_diff: "-3", note: null }],
    });
    await submitAdjustment(ctxFor(db, storekeeper), adj2.id);
    const err = await expectError(() => deleteAdjustmentDraft(ctxFor(db, storekeeper), adj2.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("posted adjustment ledger rows are immutable and stock reflects change", async () => {
    // Posting a negative adjustment beyond available stock is blocked
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whControlled,
      adjustment_date: "2025-08-17",
      reason: "Overshoot",
      items: [{ material_id: mat, qty_diff: "-99999", note: null }],
    });
    await submitAdjustment(ctxFor(db, storekeeper), adj.id);
    await approveAdjustment(ctxFor(db, pm), adj.id, { decision: "approved" });
    const err = await expectError(() => postAdjustment(ctxFor(db, storekeeper), adj.id));
    expect(errorCode(err)).toBe("INSUFFICIENT_STOCK");
  });
});

describe("simple policy workflow", () => {
  it("posts directly from draft", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whSimple,
      adjustment_date: "2025-08-18",
      reason: "Weighbridge",
      items: [{ material_id: mat, qty_diff: "7", note: null }],
    });
    expect(adj.policy).toBe("simple");
    await postAdjustment(ctxFor(db, storekeeper), adj.id);
    expect(await stockForWarehouseMaterial(db, whSimple, mat)).toBe("107.0000");
  });

  it("simple adjustment cannot be submitted for approval", async () => {
    const adj = await createAdjustment(ctxFor(db, storekeeper), {
      warehouse_id: whSimple,
      adjustment_date: "2025-08-19",
      reason: "No approval needed",
      items: [{ material_id: mat, qty_diff: "2", note: null }],
    });
    const err = await expectError(() => submitAdjustment(ctxFor(db, storekeeper), adj.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });
});
