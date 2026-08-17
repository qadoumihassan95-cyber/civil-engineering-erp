import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, mkUser, mkProject, mkBoqItem, ctxFor, expectError, errorCode } from "./helpers";
import type { Db } from "@/db";
import { boqItems } from "@/db/schema";
import {
  createDailyReport,
  submitDailyReport,
  decideDailyReport,
  getDailyReport,
  deleteDailyReport,
  type DailyReportInput,
} from "@/server/services/dailyReports";

let db: Db;
let engineer: Awaited<ReturnType<typeof mkUser>>;
let pm: Awaited<ReturnType<typeof mkUser>>;
let managerPolicyProject: string;
let nonePolicyProject: string;
let item: { id: string };

function base(overrides: Partial<DailyReportInput> = {}): DailyReportInput {
  return {
    report_date: "2025-08-10",
    weather: {},
    manpower: [{ labor_type: "Mason", count: 5 }],
    subcontractors: [],
    equipment: [],
    activities: [],
    materials_received: [],
    materials_consumed: [],
    delays: [],
    incidents: [],
    safety: [],
    visitors: [],
    file_ids: [],
    ...overrides,
  };
}

beforeAll(async () => {
  db = await setupTestDb();
  engineer = await mkUser(db, "site_engineer", "Eng");
  pm = await mkUser(db, "project_manager", "PM");
  managerPolicyProject = await mkProject(db, {
    code: "MGR-1",
    memberIds: [engineer.id, pm.id],
    settings: { dailyReportApproval: "manager" },
  });
  nonePolicyProject = await mkProject(db, {
    code: "NONE-1",
    memberIds: [engineer.id, pm.id],
    settings: { dailyReportApproval: "none" },
  });
  item = await mkBoqItem(db, managerPolicyProject, { code: "ACT-1", qty: "500", rate: "10", unit: "m3" });
});

describe("daily report workflow (manager approval policy)", () => {
  it("duplicate date on same project is rejected", async () => {
    await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base());
    const err = await expectError(() =>
      createDailyReport(ctxFor(db, engineer), managerPolicyProject, base()),
    );
    expect(errorCode(err)).toBe("CONFLICT");
  });

  it("submission applies executed quantities; rejection reverts them", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
      report_date: "2025-08-11",
      activities: [
        {
          boq_item_id: item.id,
          description: "Excavation",
          qty: "50",
          unit: "m3",
        },
      ],
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    let [boq] = await db.select().from(boqItems).where(eq(boqItems.id, item.id)).limit(1);
    expect(boq.executed_qty).toBe("50.0000");

    await decideDailyReport(ctxFor(db, pm), managerPolicyProject, report.id, {
      decision: "rejected",
      comment: "Wrong quantity",
    });
    [boq] = await db.select().from(boqItems).where(eq(boqItems.id, item.id)).limit(1);
    expect(boq.executed_qty).toBe("0.0000");
  });

  it("resubmission after edit applies the delta, not double", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
      report_date: "2025-08-12",
      activities: [{ boq_item_id: item.id, description: "Excavation", qty: "20", unit: "m3" }],
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    await decideDailyReport(ctxFor(db, pm), managerPolicyProject, report.id, { decision: "rejected", comment: "fix" });

    // edit to 30 and resubmit
    const { updateDailyReport } = await import("@/server/services/dailyReports");
    await updateDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id, base({
      report_date: "2025-08-12",
      activities: [{ boq_item_id: item.id, description: "Excavation", qty: "30", unit: "m3" }],
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);

    const [boq] = await db.select().from(boqItems).where(eq(boqItems.id, item.id)).limit(1);
    expect(boq.executed_qty).toBe("30.0000");
  });

  it("submitter cannot approve own report (separation of duties)", async () => {
    const report = await createDailyReport(ctxFor(db, pm), managerPolicyProject, base({
      report_date: "2025-08-13",
    }));
    await submitDailyReport(ctxFor(db, pm), managerPolicyProject, report.id);
    const err = await expectError(() =>
      decideDailyReport(ctxFor(db, pm), managerPolicyProject, report.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("SEPARATION_OF_DUTIES");
  });

  it("approval requires a different reviewer and records it", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
      report_date: "2025-08-14",
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    await decideDailyReport(ctxFor(db, pm), managerPolicyProject, report.id, { decision: "approved" });
    const full = await getDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    expect(full.status).toBe("approved");
    expect(full.reviewed_by).toBe(pm.id);
  });

  it("only drafts and rejected reports are editable", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
      report_date: "2025-08-15",
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    const { updateDailyReport } = await import("@/server/services/dailyReports");
    const err = await expectError(() =>
      updateDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id, base({ report_date: "2025-08-15" })),
    );
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("submitted report cannot be deleted", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
      report_date: "2025-08-16",
    }));
    await submitDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id);
    const err = await expectError(() => deleteDailyReport(ctxFor(db, engineer), managerPolicyProject, report.id));
    expect(errorCode(err)).toBe("INVALID_STATE");
  });

  it("linked BOQ item from another project is rejected", async () => {
    const otherProject = await mkProject(db, { code: "OTH-1", memberIds: [engineer.id] });
    const foreign = await mkBoqItem(db, otherProject, { code: "F-1" });
    const err = await expectError(() =>
      createDailyReport(ctxFor(db, engineer), managerPolicyProject, base({
        report_date: "2025-08-17",
        activities: [{ boq_item_id: foreign.id, description: "X", qty: "1" }],
      })),
    );
    expect(errorCode(err)).toBe("VALIDATION");
  });
});

describe("daily report workflow (no approval policy)", () => {
  it("submission is final and approval attempts are rejected", async () => {
    const report = await createDailyReport(ctxFor(db, engineer), nonePolicyProject, base());
    await submitDailyReport(ctxFor(db, engineer), nonePolicyProject, report.id);
    const full = await getDailyReport(ctxFor(db, engineer), nonePolicyProject, report.id);
    expect(full.status).toBe("submitted");

    const err = await expectError(() =>
      decideDailyReport(ctxFor(db, pm), nonePolicyProject, report.id, { decision: "approved" }),
    );
    expect(errorCode(err)).toBe("INVALID_STATE");
  });
});
