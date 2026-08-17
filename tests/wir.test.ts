import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, mkUser, mkProject, mkBoqItem, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import {
  createWirDraft,
  submitWir,
  startWirReview,
  decideWir,
  updateWirDraft,
  getWir,
  canTransition,
} from "@/server/services/wir";

let db: Db;
let engineer: Awaited<ReturnType<typeof mkUser>>;
let qaqc: Awaited<ReturnType<typeof mkUser>>;
let pm: Awaited<ReturnType<typeof mkUser>>;
let projectId: string;
let item: { id: string; unit: string };

beforeAll(async () => {
  db = await setupTestDb();
  engineer = await mkUser(db, "site_engineer", "Eng A");
  qaqc = await mkUser(db, "qa_qc", "QA B");
  pm = await mkUser(db, "project_manager", "PM C");
  projectId = await mkProject(db, { memberIds: [engineer.id, qaqc.id, pm.id] });
  item = await mkBoqItem(db, projectId, { qty: "1000", rate: "100", unit: "m3" });
});

describe("WIR state machine", () => {
  it("allows only defined transitions", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("under_review", "approved")).toBe(true);
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(canTransition("returned", "submitted")).toBe(true);
  });

  it("full happy path: draft → submitted → under_review → approved", async () => {
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 1",
      submitted_qty: "100",
      file_ids: [],
    });
    expect(draft.number).toMatch(/^WIR-\d{3}$/);

    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    let wir = await getWir(ctxFor(db, engineer), projectId, draft.id);
    expect(wir.status).toBe("submitted");

    await startWirReview(ctxFor(db, qaqc), projectId, draft.id);
    wir = await getWir(ctxFor(db, engineer), projectId, draft.id);
    expect(wir.status).toBe("under_review");

    await decideWir(ctxFor(db, qaqc), projectId, draft.id, {
      decision: "approved",
      approved_qty: "100",
    });
    wir = await getWir(ctxFor(db, engineer), projectId, draft.id);
    expect(wir.status).toBe("approved");
    expect(wir.approved_qty).toBe("100.0000");
    expect(wir.events).toHaveLength(4);
  });

  it("cannot approve an already approved WIR (no double counting)", async () => {
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 2",
      submitted_qty: "50",
      file_ids: [],
    });
    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    await startWirReview(ctxFor(db, qaqc), projectId, draft.id);
    await decideWir(ctxFor(db, qaqc), projectId, draft.id, { decision: "approved" });
    const err = await expectError(() =>
      decideWir(ctxFor(db, qaqc), projectId, draft.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("engineer cannot approve their own WIR (separation of duties)", async () => {
    const pmEngineer = await mkUser(db, "project_manager", "PM-Eng");
    await db.insert(
      (await import("@/db/schema")).projectMembers,
    ).values({ project_id: projectId, user_id: pmEngineer.id });
    const draft = await createWirDraft(ctxFor(db, pmEngineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 3",
      submitted_qty: "20",
      file_ids: [],
    });
    await submitWir(ctxFor(db, pmEngineer), projectId, draft.id);
    await startWirReview(ctxFor(db, pmEngineer), projectId, draft.id);
    const err = await expectError(() =>
      decideWir(ctxFor(db, pmEngineer), projectId, draft.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("SEPARATION_OF_DUTIES");
  });

  it("return requires comment; returned WIR can be edited and resubmitted", async () => {
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 4",
      submitted_qty: "15",
      file_ids: [],
    });
    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    await startWirReview(ctxFor(db, qaqc), projectId, draft.id);
    const noComment = await expectError(() =>
      decideWir(ctxFor(db, qaqc), projectId, draft.id, { decision: "returned" }),
    );
    expect(errorCode(noComment)).toBe("VALIDATION");

    await decideWir(ctxFor(db, qaqc), projectId, draft.id, { decision: "returned", comment: "Fix location" });
    let wir = await getWir(ctxFor(db, engineer), projectId, draft.id);
    expect(wir.status).toBe("returned");

    await updateWirDraft(ctxFor(db, engineer), projectId, draft.id, { submitted_qty: "18" });
    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    wir = await getWir(ctxFor(db, engineer), projectId, draft.id);
    expect(wir.status).toBe("submitted");
    expect(wir.submitted_qty).toBe("18.0000");
    expect(wir.revision).toBe(1);
  });

  it("rejection is terminal and requires a comment", async () => {
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 5",
      submitted_qty: "5",
      file_ids: [],
    });
    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    await startWirReview(ctxFor(db, qaqc), projectId, draft.id);
    await decideWir(ctxFor(db, qaqc), projectId, draft.id, { decision: "rejected", comment: "Not per spec" });
    const err = await expectError(() =>
      submitWir(ctxFor(db, engineer), projectId, draft.id),
    );
    expect(errorCode(err)).toBe("INVALID_STATE");
  });
});

describe("WIR quantity integrity", () => {
  it("blocks submission exceeding remaining contract quantity", async () => {
    const committed = await db
      .select()
      .from((await import("@/db/schema")).wir)
      .then((rows) => rows.filter((r) => r.boq_item_id === item.id && ["submitted", "under_review", "approved", "approved_with_comments"].includes(r.status))
        .reduce((a, r) => a + parseFloat(r.submitted_qty), 0));
    const remaining = 1000 - committed;
    const tooMuch = String(remaining + 1);
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 6",
      submitted_qty: tooMuch,
      file_ids: [],
    });
    const err = await expectError(() => submitWir(ctxFor(db, engineer), projectId, draft.id));
    expect(errorCode(err)).toBe("QUANTITY_EXCEEDED");
  });

  it("approval quantity cannot exceed submitted quantity", async () => {
    const draft = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 7",
      submitted_qty: "40",
      file_ids: [],
    });
    await submitWir(ctxFor(db, engineer), projectId, draft.id);
    await startWirReview(ctxFor(db, qaqc), projectId, draft.id);
    const err = await expectError(() =>
      decideWir(ctxFor(db, qaqc), projectId, draft.id, {
        decision: "approved",
        approved_qty: "41",
      }),
    );
    expect(errorCode(err)).toBe("QUANTITY_EXCEEDED");
  });

  it("submitted quantity must be positive", async () => {
    const err = await expectError(() =>
      createWirDraft(ctxFor(db, engineer), projectId, {
        boq_item_id: item.id,
        location: "Zone 8",
        submitted_qty: "0",
        file_ids: [],
      }),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });

  it("cannot approve quantity that would exceed remaining contract", async () => {
    // Determine remaining, submit full remaining on WIR-A, then try to approve
    // WIR-B whose approval would push the total over the contract quantity.
    const { wir } = await import("@/db/schema");
    const rows = await db.select().from(wir).where(
      (await import("drizzle-orm")).sql`${wir.boq_item_id} = ${item.id} and ${wir.status} in ('submitted','under_review','approved','approved_with_comments')`,
    );
    const committed = rows.reduce((a, r) => a + parseFloat(r.submitted_qty), 0);
    const remaining = 1000 - committed;

    const a = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 9",
      submitted_qty: String(remaining),
      file_ids: [],
    });
    await submitWir(ctxFor(db, engineer), projectId, a.id);
    await startWirReview(ctxFor(db, qaqc), projectId, a.id);
    await decideWir(ctxFor(db, qaqc), projectId, a.id, { decision: "approved" });

    // Now remaining is 0 → a new submission must fail
    const b = await createWirDraft(ctxFor(db, engineer), projectId, {
      boq_item_id: item.id,
      location: "Zone 10",
      submitted_qty: "1",
      file_ids: [],
    });
    const err = await expectError(() => submitWir(ctxFor(db, engineer), projectId, b.id));
    expect(errorCode(err)).toBe("QUANTITY_EXCEEDED");
  });
});
