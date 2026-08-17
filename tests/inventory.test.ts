import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import { createWarehouse, createMaterial, stockForWarehouseMaterial } from "@/server/services/inventory";
import { createReceipt, postReceipt, createIssue, postIssue, createTransfer, postTransfer, createSupplierReturn, postSupplierReturn, deleteDraftReceipt } from "@/server/services/movements";

let db: Db;
let storekeeper: Awaited<ReturnType<typeof mkUser>>;
let engineer: Awaited<ReturnType<typeof mkUser>>;
let projectId: string;
let whMain: string;
let whSite: string;
let mat: string;
let mat2: string;

beforeAll(async () => {
  db = await setupTestDb();
  storekeeper = await mkUser(db, "storekeeper", "Store K");
  engineer = await mkUser(db, "site_engineer", "Eng E");
  projectId = await mkProject(db, { memberIds: [storekeeper.id, engineer.id] });
  whMain = (await createWarehouse(ctxFor(db, storekeeper), { code: "WH-M", name: "Main", is_active: true })).id;
  whSite = (await createWarehouse(ctxFor(db, storekeeper), { code: "WH-S", name: "Site", project_id: projectId, is_active: true })).id;
  mat = (await createMaterial(ctxFor(db, storekeeper), { code: "MAT-1", name: "Cement", unit: "bag", min_stock: "0", is_active: true })).id;
  mat2 = (await createMaterial(ctxFor(db, storekeeper), { code: "MAT-2", name: "Steel", unit: "ton", min_stock: "0", is_active: true })).id;
});

async function stock(wh: string, m: string): Promise<string> {
  return stockForWarehouseMaterial(db, wh, m);
}

describe("receipts & posting", () => {
  it("posts ledger rows and updates stock", async () => {
    const r = await createReceipt(ctxFor(db, storekeeper), {
      warehouse_id: whMain,
      receipt_date: "2025-08-01",
      items: [{ material_id: mat, qty: "100", unit_cost: "5.000" }],
    });
    await postReceipt(ctxFor(db, storekeeper), r.id);
    expect(await stock(whMain, mat)).toBe("100.0000");
  });

  it("draft receipt cannot be posted twice", async () => {
    const r = await createReceipt(ctxFor(db, storekeeper), {
      warehouse_id: whMain,
      receipt_date: "2025-08-02",
      items: [{ material_id: mat, qty: "10" }],
    });
    await postReceipt(ctxFor(db, storekeeper), r.id);
    const err = await expectError(() => postReceipt(ctxFor(db, storekeeper), r.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("posted receipt cannot be deleted", async () => {
    const r = await createReceipt(ctxFor(db, storekeeper), {
      warehouse_id: whMain,
      receipt_date: "2025-08-03",
      items: [{ material_id: mat, qty: "5" }],
    });
    await postReceipt(ctxFor(db, storekeeper), r.id);
    const err = await expectError(() => deleteDraftReceipt(ctxFor(db, storekeeper), r.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("draft receipt with zero qty is rejected", async () => {
    const err = await expectError(() =>
      createReceipt(ctxFor(db, storekeeper), {
        warehouse_id: whMain,
        receipt_date: "2025-08-04",
        items: [{ material_id: mat, qty: "0" }],
      }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });
});

describe("issues & negative stock protection", () => {
  it("blocks posting an issue when stock is insufficient", async () => {
    const iss = await createIssue(ctxFor(db, storekeeper), {
      warehouse_id: whSite,
      issue_date: "2025-08-05",
      items: [{ material_id: mat2, qty: "999" }],
    });
    const err = await expectError(() => postIssue(ctxFor(db, storekeeper), iss.id));
    expect(errorCode(err)).toBe("INSUFFICIENT_STOCK");
  });

  it("posts an issue when stock is available and reduces it", async () => {
    // move stock to site first
    const tr = await createTransfer(ctxFor(db, storekeeper), {
      from_warehouse_id: whMain,
      to_warehouse_id: whSite,
      transfer_date: "2025-08-06",
      items: [{ material_id: mat, qty: "40" }],
    });
    await postTransfer(ctxFor(db, storekeeper), tr.id);
    expect(await stock(whSite, mat)).toBe("40.0000");
    expect(await stock(whMain, mat)).toBe("75.0000");

    const iss = await createIssue(ctxFor(db, storekeeper), {
      warehouse_id: whSite,
      issue_date: "2025-08-07",
      items: [{ material_id: mat, qty: "25" }],
    });
    await postIssue(ctxFor(db, storekeeper), iss.id);
    expect(await stock(whSite, mat)).toBe("15.0000");
  });
});

describe("transfers & returns", () => {
  it("transfer requires different warehouses", async () => {
    const err = await expectError(() =>
      createTransfer(ctxFor(db, storekeeper), {
        from_warehouse_id: whMain,
        to_warehouse_id: whMain,
        transfer_date: "2025-08-08",
        items: [{ material_id: mat, qty: "1" }],
      }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });

  it("supplier return reduces stock", async () => {
    const before = await stock(whMain, mat);
    const ret = await createSupplierReturn(ctxFor(db, storekeeper), {
      warehouse_id: whMain,
      return_date: "2025-08-09",
      reason: "Damaged",
      items: [{ material_id: mat, qty: "5" }],
    });
    await postSupplierReturn(ctxFor(db, storekeeper), ret.id);
    const after = await stock(whMain, mat);
    expect(parseFloat(after)).toBeCloseTo(parseFloat(before) - 5, 4);
  });
});

function errText(e: unknown): string {
  let cur: unknown = e;
  let text = "";
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === "object" && "message" in (cur as object)) {
      text += String((cur as { message: unknown }).message) + " ";
    }
    cur = (cur as { cause?: unknown })?.cause;
  }
  return text;
}

describe("ledger immutability (database trigger)", () => {
  it("UPDATE on stock_transactions raises an exception", async () => {
    const err = await expectError(async () => {
      await db.execute(
        (await import("drizzle-orm")).sql`update stock_transactions set qty = qty where true`,
      );
    });
    expect(errText(err)).toMatch(/immutable/i);
  });

  it("DELETE on stock_transactions raises an exception", async () => {
    const err = await expectError(async () => {
      await db.execute(
        (await import("drizzle-orm")).sql`delete from stock_transactions where true`,
      );
    });
    expect(errText(err)).toMatch(/immutable/i);
  });
});
