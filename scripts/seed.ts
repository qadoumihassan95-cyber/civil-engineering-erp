import { createDb } from "../src/db";
import { users, projects, projectMembers, boqSections, boqItems, materials, materialCategories, suppliers, warehouses, stockTransactions, receipts, receiptItems, issues, issueItems, transfers, transferItems, supplierReturns, returnItems, adjustments, adjustmentItems, expenses, expenseCategories, documents, files, entityFiles, dailyReports, wir, wirEvents, drEvents, sessions, auditLogs } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { hashPassword } from "../src/server/auth/password";
import { newId } from "../src/server/lib/ids";
import { mulMoney } from "../src/server/lib/decimal";
import type { Db } from "../src/db";

const PASSWORD = "Password123!";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const { db, client } = createDb(url, { prepare: true });

  console.log("Truncating…");
  const tables = [
    "audit_logs", "dr_events", "dr_visitors", "dr_safety", "dr_incidents", "dr_delays",
    "dr_material_consumed", "dr_material_received", "dr_activities", "dr_equipment",
    "dr_subcontractors", "dr_manpower", "daily_reports",
    "wir_events", "entity_files", "wir",
    "stock_transactions", "return_items", "supplier_returns",
    "transfer_items", "transfers", "issue_items", "issues",
    "receipt_items", "receipts", "adjustment_items", "adjustments",
    "documents", "files", "expenses", "expense_categories",
    "materials", "material_categories", "suppliers", "warehouses",
    "project_members", "boq_items", "boq_sections", "projects",
    "sessions", "users",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`truncate table ${t} restart identity cascade`));
  }

  console.log("Seeding users…");
  const u = await seedUsers(db);

  console.log("Seeding projects…");
  const ps = await seedProjects(db, u);

  console.log("Seeding BOQ…");
  const boq = await seedBoq(db, ps);

  console.log("Seeding materials & suppliers…");
  const inv = await seedInventoryMasters(db, ps);

  console.log("Seeding inventory movements…");
  await seedMovements(db, ps, inv, u);

  console.log("Seeding WIRs…");
  await seedWirs(db, ps, boq, u);

  console.log("Seeding daily reports…");
  await seedDailyReports(db, ps, boq, u, inv);

  console.log("Seeding expenses…");
  await seedExpenses(db, ps, u);

  console.log("Seeding documents…");
  await seedDocuments(db, ps, u);

  console.log("Seeding audit trail…");
  await seedAudit(db);

  console.log("Adjusting historical timestamps…");
  await backdate(db);

  console.log("Seed complete.");
  await client.end();
}

// ---------------------------------------------------------------------------

interface Users {
  superAdmin: string;
  owner: string;
  gm: string;
  pm1: string; pm2: string; pm3: string;
  eng1: string; eng2: string; eng3: string; eng4: string;
  qaqc: string;
  qs: string;
  store1: string; store2: string;
  accountant: string;
  auditor: string;
  viewer: string;
}

async function seedUsers(db: Db): Promise<Users> {
  const hash = await hashPassword(PASSWORD);
  const mk = async (email: string, name: string, role: string) => {
    const id = newId();
    await db.insert(users).values({ id, email, name, role: role as never, password_hash: hash, locale: "en" });
    return id;
  };
  const u: Users = {
    superAdmin: await mk("admin@civilerp.io", "System Administrator", "super_admin"),
    owner: await mk("owner@civilerp.io", "Eng. Mahmoud Odeh", "owner"),
    gm: await mk("gm@civilerp.io", "Eng. Samer Hadidi", "general_manager"),
    pm1: await mk("pm.amman@civilerp.io", "Eng. Rami Khreis", "project_manager"),
    pm2: await mk("pm.deadsea@civilerp.io", "Eng. Lina Qudah", "project_manager"),
    pm3: await mk("pm.irbid@civilerp.io", "Eng. Fadi Nsour", "project_manager"),
    eng1: await mk("eng.abdullah@civilerp.io", "Eng. Abdullah Yousef", "site_engineer"),
    eng2: await mk("eng.mohammad@civilerp.io", "Eng. Mohammad Salameh", "site_engineer"),
    eng3: await mk("eng.hamza@civilerp.io", "Eng. Hamza Zureikat", "site_engineer"),
    eng4: await mk("eng.rawan@civilerp.io", "Eng. Rawan Bataineh", "site_engineer"),
    qaqc: await mk("qaqc@civilerp.io", "Eng. Omar Mashaqbeh", "qa_qc"),
    qs: await mk("qs@civilerp.io", "Eng. Dana Al-Amad", "quantity_surveyor"),
    store1: await mk("store.central@civilerp.io", "Khalid Haddad", "storekeeper"),
    store2: await mk("store.site@civilerp.io", "Ibrahim Odat", "storekeeper"),
    accountant: await mk("accountant@civilerp.io", "Abeer Shorman", "accountant"),
    auditor: await mk("auditor@civilerp.io", "Tariq Zawati", "auditor"),
    viewer: await mk("viewer@civilerp.io", "Salma Ayyash", "viewer"),
  };
  return u;
}

interface ProjectIds {
  abj: string; dsc: string; irb: string; zar: string; aqj: string;
}

type ProjectSeed = Partial<typeof projects.$inferInsert>;

async function seedProjects(db: Db, u: Users): Promise<ProjectIds> {
  const mk = async (p: ProjectSeed, memberIds: string[]) => {
    const id = newId();
    await db.insert(projects).values({ id, ...p } as typeof projects.$inferInsert);
    await db.insert(projectMembers).values(
      [...new Set([...memberIds, p.manager_id as string])].map((userId) => ({ project_id: id, user_id: userId })),
    );
    return id;
  };

  const abj = await mk(
    {
      code: "ABJ-01",
      name: "Abdali Boulevard Residential Tower",
      description: "24-storey residential tower with 3 basement levels in Abdali district, Amman.",
      client_name: "Abdali Investment Group",
      consultant_name: "Dar Al-Handasah",
      contractor_name: "Al-Masar Construction Co.",
      location: "Abdali, Amman",
      contract_value: "18500000.000",
      start_date: "2024-03-01",
      planned_end_date: "2027-03-31",
      status: "active",
      manager_id: u.pm1,
      settings: { dailyReportApproval: "manager", stockAdjustmentPolicy: "controlled", allowNegativeStock: false },
    },
    [u.eng1, u.eng2, u.qaqc, u.qs, u.store2, u.accountant, u.gm, u.owner],
  );

  const dsc = await mk(
    {
      code: "DSC-02",
      name: "Dead Sea Shoreline Resort & Access Road",
      description: "Resort complex with 12 km access road and retaining structures near the Dead Sea shore.",
      client_name: "Jordan Hotels & Resorts Co.",
      consultant_name: "CDM Smith",
      contractor_name: "Al-Masar Construction Co.",
      location: "Sweimeh, Dead Sea",
      contract_value: "9800000.000",
      start_date: "2024-06-15",
      planned_end_date: "2027-06-30",
      status: "active",
      manager_id: u.pm2,
      settings: { dailyReportApproval: "none", stockAdjustmentPolicy: "simple", allowNegativeStock: false },
    },
    [u.eng3, u.qaqc, u.qs, u.store2, u.accountant, u.gm, u.owner],
  );

  const irb = await mk(
    {
      code: "IRB-03",
      name: "Irbid Logistics Warehouse & Cold Storage",
      description: "Two steel-frame warehouses (12,000 m²) with cold storage and offices in Al-Hassan Industrial Estate.",
      client_name: "North Logistics LLC",
      consultant_name: "Omrania & Associates",
      contractor_name: "Al-Masar Construction Co.",
      location: "Al-Hassan Industrial Estate, Irbid",
      contract_value: "4200000.000",
      start_date: "2025-01-10",
      planned_end_date: "2026-12-31",
      status: "active",
      manager_id: u.pm3,
      settings: { dailyReportApproval: "manager", stockAdjustmentPolicy: "controlled", allowNegativeStock: false },
    },
    [u.eng4, u.qaqc, u.qs, u.store2, u.accountant, u.gm, u.owner],
  );

  const zar = await mk(
    {
      code: "ZAR-04",
      name: "Zarqa Wastewater Treatment Plant — Phase 2",
      description: "Expansion of WWTP capacity to 60,000 m³/day: clarifiers, aeration basins, pump stations.",
      client_name: "Miyahuna / Water Authority",
      consultant_name: "ILF Consulting Engineers",
      contractor_name: "Al-Masar Construction Co.",
      location: "Zarqa",
      contract_value: "12500000.000",
      start_date: "2023-11-01",
      planned_end_date: "2026-06-30",
      status: "active",
      manager_id: u.pm1,
      settings: { dailyReportApproval: "manager", stockAdjustmentPolicy: "controlled", allowNegativeStock: false },
    },
    [u.eng1, u.qaqc, u.qs, u.store2, u.accountant, u.gm, u.owner],
  );

  const aqj = await mk(
    {
      code: "AQJ-05",
      name: "Aqaba Port Logistics Facility",
      description: "Container yard pavements, admin building and gantry crane foundations at Aqaba South Port.",
      client_name: "Aqaba Development Corporation",
      consultant_name: "RHDHV",
      contractor_name: "Al-Masar Construction Co.",
      location: "Aqaba",
      contract_value: "7600000.000",
      start_date: "2025-04-01",
      planned_end_date: "2027-12-31",
      status: "planning",
      manager_id: u.pm2,
      settings: { dailyReportApproval: "manager", stockAdjustmentPolicy: "controlled", allowNegativeStock: false },
    },
    [u.eng3, u.qaqc, u.qs, u.store2, u.accountant, u.gm, u.owner],
  );

  return { abj, dsc, irb, zar, aqj };
}

interface BoqIds {
  [projectId: string]: { [sectionKey: string]: { sectionId: string; items: { id: string; code: string; qty: string; rate: string; unit: string }[] } };
}

async function seedBoq(db: Db, ps: ProjectIds): Promise<BoqIds> {
  const out: BoqIds = {};

  const boqDefs: Record<string, { section: string; title: string; items: [string, string, string, string, string][] }[]> = {
    [ps.abj]: [
      {
        section: "01", title: "Site Works & Excavation",
        items: [
          ["01-01", "Site clearance and demolition works", "lsum", "1", "45000"],
          ["01-02", "Excavation to reduced levels including cart away", "m3", "18500", "4.5"],
          ["01-03", "Backfilling with approved granular fill, compacted", "m3", "4200", "8.2"],
        ],
      },
      {
        section: "02", title: "Concrete Works",
        items: [
          ["02-01", "Blinding concrete C15, 75mm thick", "m2", "6400", "4.8"],
          ["02-02", "Reinforced concrete raft foundations C40, incl. steel", "m3", "9800", "165"],
          ["02-03", "RC columns C40", "m3", "3200", "210"],
          ["02-04", "RC slabs C35 (post-tensioned where noted)", "m3", "14800", "185"],
          ["02-05", "RC shear walls C40", "m3", "5600", "205"],
        ],
      },
      {
        section: "03", title: "Blockwork & Masonry",
        items: [
          ["03-01", "150mm lightweight concrete block walls", "m2", "22500", "12.5"],
          ["03-02", "100mm partitions incl. plaster both faces", "m2", "8400", "16"],
        ],
      },
      {
        section: "04", title: "Finishes",
        items: [
          ["04-01", "Ceramic floor tiling 600x600", "m2", "9600", "18"],
          ["04-02", "Marble flooring in lobby areas", "m2", "1200", "85"],
          ["04-03", "Epoxy painting for basement parking", "m2", "7800", "9.5"],
        ],
      },
      {
        section: "05", title: "MEP Works",
        items: [
          ["05-01", "HVAC supply and installation, complete", "lsum", "1", "2400000"],
          ["05-02", "Plumbing & drainage, complete", "lsum", "1", "980000"],
          ["05-03", "Fire fighting system incl. sprinklers", "lsum", "1", "750000"],
          ["05-04", "Elevators — 4 units, 21 stops", "nos", "4", "185000"],
        ],
      },
    ],
    [ps.dsc]: [
      {
        section: "01", title: "Earthworks & Roads",
        items: [
          ["01-01", "Access road subgrade preparation", "m2", "88000", "1.8"],
          ["01-02", "Granular sub-base, 200mm", "m2", "88000", "3.6"],
          ["01-03", "Asphalt binder course 60mm", "m2", "88000", "5.2"],
          ["01-04", "Asphalt wearing course 40mm", "m2", "88000", "4.1"],
        ],
      },
      {
        section: "02", title: "Retaining Structures",
        items: [
          ["02-01", "Gabion retaining walls", "m3", "1450", "42"],
          ["02-02", "RC retaining wall with stone facing", "m3", "2600", "240"],
        ],
      },
      {
        section: "03", title: "Buildings",
        items: [
          ["03-01", "Resort chalets — structural frame", "nos", "48", "52000"],
          ["03-02", "Main clubhouse building", "lsum", "1", "1500000"],
          ["03-03", "Swimming pools incl. waterproofing", "m2", "1800", "320"],
        ],
      },
    ],
    [ps.irb]: [
      {
        section: "01", title: "Earthworks & Foundations",
        items: [
          ["01-01", "Site grading and compaction", "m2", "22000", "1.5"],
          ["01-02", "RC pad footings", "m3", "950", "150"],
        ],
      },
      {
        section: "02", title: "Steel Structure",
        items: [
          ["02-01", "Structural steel frame supply & erection", "ton", "640", "1350"],
          ["02-02", "Roof cladding insulated panels", "m2", "12800", "28"],
          ["02-03", "Wall cladding panels", "m2", "6900", "24"],
        ],
      },
      {
        section: "03", title: "Civil & Cold Storage",
        items: [
          ["03-01", "Power-floated floor slab 200mm", "m2", "12000", "38"],
          ["03-02", "Cold storage insulated panels & units", "m2", "2400", "220"],
          ["03-03", "External yard interlock paving", "m2", "6800", "12"],
        ],
      },
    ],
    [ps.zar]: [
      {
        section: "01", title: "Civil Works",
        items: [
          ["01-01", "Excavation for basins", "m3", "26000", "3.2"],
          ["01-02", "RC aeration basins C35 with waterproofing", "m3", "7400", "195"],
          ["01-03", "RC clarifiers", "m3", "3900", "210"],
        ],
      },
      {
        section: "02", title: "Process Equipment",
        items: [
          ["02-01", "Fine bubble diffusers", "nos", "8200", "14"],
          ["02-02", "Submersible pumps incl. controls", "nos", "18", "28500"],
          ["02-03", "Sludge dewatering units", "nos", "3", "145000"],
        ],
      },
      {
        section: "03", title: "Pipelines",
        items: [
          ["03-01", "Ductile iron pipe DN300", "m", "1450", "95"],
          ["03-02", "HDPE pipe DN500", "m", "860", "180"],
        ],
      },
    ],
    [ps.aqj]: [
      {
        section: "01", title: "Pavements",
        items: [
          ["01-01", "Container yard pavement — reinforced concrete 300mm", "m2", "42000", "48"],
          ["01-02", "Heavy-duty asphalt for haul roads", "m2", "15000", "9"],
        ],
      },
      {
        section: "02", title: "Buildings & Foundations",
        items: [
          ["02-01", "Gantry crane rail foundations", "m", "720", "850"],
          ["02-02", "Admin building 1,200 m²", "lsum", "1", "680000"],
        ],
      },
    ],
  };

  for (const [projectId, sections] of Object.entries(boqDefs)) {
    out[projectId] = {};
    for (const def of sections) {
      const sectionId = newId();
      await db.insert(boqSections).values({
        id: sectionId,
        project_id: projectId,
        code: def.section,
        title: def.title,
        sort: parseInt(def.section, 10),
      });
      const items = [];
      let sort = 0;
      for (const [code, desc, unit, qty, rate] of def.items) {
        const id = newId();
        items.push({ id, code, qty, rate, unit });
        await db.insert(boqItems).values({
          id,
          project_id: projectId,
          section_id: sectionId,
          code,
          description: desc,
          unit,
          contract_qty: qty,
          unit_rate: rate,
          contract_amount: mulMoney(qty, rate),
          sort: sort++,
        });
      }
      out[projectId][def.section] = { sectionId, items };
    }
  }
  return out;
}

interface InvIds {
  catStruct: string; catFin: string; catMep: string; catAgg: string;
  matC40: string; matSteel: string; matBlocks: string; matAgg: string; matSand: string; matAsphalt: string; matCladding: string; matPipeDI: string; matPaint: string;
  supSteel: string; supAgg: string; supMep: string; supBlocks: string;
  whMain: string; whAbj: string; whDsc: string; whIrb: string;
}

async function seedInventoryMasters(db: Db, ps: ProjectIds): Promise<InvIds> {
  const cat = async (name: string, nameAr?: string) => {
    const id = newId();
    await db.insert(materialCategories).values({ id, name, name_ar: nameAr ?? null });
    return id;
  };
  const catStruct = await cat("Structural Materials", "مواد إنشائية");
  const catFin = await cat("Finishes", "تشطيبات");
  const catMep = await cat("MEP", "كهروميكانيك");
  const catAgg = await cat("Aggregates & Earthworks", "ركام وأعمال ترابية");

  const mat = async (code: string, name: string, categoryId: string, unit: string, minStock: string, nameAr?: string) => {
    const id = newId();
    await db.insert(materials).values({ id, code, name, name_ar: nameAr ?? null, category_id: categoryId, unit, min_stock: minStock });
    return id;
  };
  const matC40 = await mat("CON-C40", "Ready Mix Concrete C40", catStruct, "m3", "50", "خرسانة جاهزة C40");
  const matSteel = await mat("STL-RB12", "Reinforcement Steel Grade 60 (D12)", catStruct, "ton", "20", "حديد تسليح 60 (قطر 12)");
  const matBlocks = await mat("BLK-15", "Lightweight Concrete Blocks 150mm", catStruct, "nos", "5000", "بلوك خفيف 150 مم");
  const matAgg = await mat("AGG-20", "Crushed Aggregate 20mm", catAgg, "m3", "200", "ركام مكسر 20 مم");
  const matSand = await mat("SND-PLASTER", "Plastering Sand", catAgg, "m3", "100", "رمل لياسة");
  const matAsphalt = await mat("ASP-WC", "Asphalt Wearing Course Mix", catAgg, "ton", "100", "خلطة إسفلتية سطحية");
  const matCladding = await mat("CLD-INS", "Insulated Roof Panels", catFin, "m2", "500", "ألواح عازلة للأسقف");
  const matPipeDI = await mat("PIP-DI300", "Ductile Iron Pipe DN300", catMep, "m", "100", "أنابيب حديد مطاوع DN300");
  const matPaint = await mat("PNT-EPX", "Epoxy Floor Paint", catFin, "liter", "200", "دهان إيبوكسي");

  const sup = async (name: string, contact: string, phone: string) => {
    const id = newId();
    await db.insert(suppliers).values({ id, name, contact_person: contact, phone, is_active: true });
    return id;
  };
  const supSteel = await sup("Jordan Steel Trading Co.", "Emad Shami", "0796-552-1100");
  const supAgg = await sup("Al-Safwa Aggregates", "Nidal Bani Hani", "0777-200-8890");
  const supMep = await sup("Amman HVAC & Plumbing Supplies", "Rasha Kanaan", "0795-101-3345");
  const supBlocks = await sup("Yarmouk Blocks Factory", "Hasan Ayasrah", "0788-455-2210");

  const wh = async (code: string, name: string, projectId: string | null) => {
    const id = newId();
    await db.insert(warehouses).values({ id, code, name, name_ar: null, project_id: projectId });
    return id;
  };
  const whMain = await wh("WH-MAIN", "Central Warehouse — Sahab", null);
  const whAbj = await wh("WH-ABJ", "Abdali Site Store", ps.abj);
  const whDsc = await wh("WH-DSC", "Dead Sea Site Store", ps.dsc);
  const whIrb = await wh("WH-IRB", "Irbid Site Store", ps.irb);

  const cats = [catStruct, catFin, catMep, catAgg];

  // expense categories
  for (const [name, nameAr] of [
    ["Equipment Rental", "تأجير معدات"],
    ["Fuel & Lubricants", "وقود وزيوت"],
    ["Subcontractor Payments", "دفعات مقاولي الباطن"],
    ["Site Overheads", "نفقات الموقع العامة"],
    ["Material Purchases", "مشتريات مواد"],
    ["Salaries & Wages", "رواتب وأجور"],
    ["Consultant Fees", "أتعاب استشارية"],
  ]) {
    await db.insert(expenseCategories).values({ id: newId(), name, name_ar: nameAr });
  }

  return { catStruct, catFin, catMep, catAgg, matC40, matSteel, matBlocks, matAgg, matSand, matAsphalt, matCladding, matPipeDI, matPaint, supSteel, supAgg, supMep, supBlocks, whMain, whAbj, whDsc, whIrb };
}

async function seedMovements(db: Db, ps: ProjectIds, inv: InvIds, u: Users) {
  const ledgerRows: (typeof stockTransactions.$inferInsert)[] = [];
  let postedById = u.store1;
  const addLedger = (txn_type: "receipt" | "issue" | "transfer_in" | "transfer_out" | "supplier_return" | "adjustment", warehouse_id: string, material_id: string, project_id: string | null, qty: string, unit_cost: string | null, ref_type: string, ref_id: string, note?: string) => {
    ledgerRows.push({ txn_type, warehouse_id, material_id, project_id, qty, unit_cost, ref_type, ref_id, note: note ?? null, posted_by: postedById });
  };

  // ---- Receipts (posted) ----
  const grn1 = newId();
  await db.insert(receipts).values({
    id: grn1, number: "GRN-0001", supplier_id: inv.supSteel, warehouse_id: inv.whMain,
    receipt_date: "2025-05-12", status: "posted", received_by: u.store1, posted_at: "2025-05-12T09:30:00+03:00",
  });
  await db.insert(receiptItems).values([
    { receipt_id: grn1, material_id: inv.matSteel, qty: "85", unit_cost: "648.500" },
    { receipt_id: grn1, material_id: inv.matBlocks, qty: "12000", unit_cost: "0.850" },
  ]);
  addLedger("receipt", inv.whMain, inv.matSteel, null, "85", "648.500", "receipt", "GRN-0001");
  addLedger("receipt", inv.whMain, inv.matBlocks, null, "12000", "0.850", "receipt", "GRN-0001");

  const grn2 = newId();
  await db.insert(receipts).values({
    id: grn2, number: "GRN-0002", supplier_id: inv.supAgg, warehouse_id: inv.whAbj, project_id: ps.abj,
    receipt_date: "2025-06-02", status: "posted", received_by: u.store2, posted_at: "2025-06-02T11:00:00+03:00",
  });
  await db.insert(receiptItems).values([
    { receipt_id: grn2, material_id: inv.matAgg, qty: "420", unit_cost: "6.400" },
    { receipt_id: grn2, material_id: inv.matSand, qty: "180", unit_cost: "4.100" },
  ]);
  addLedger("receipt", inv.whAbj, inv.matAgg, ps.abj, "420", "6.400", "receipt", "GRN-0002");
  addLedger("receipt", inv.whAbj, inv.matSand, ps.abj, "180", "4.100", "receipt", "GRN-0002");

  const grn3 = newId();
  await db.insert(receipts).values({
    id: grn3, number: "GRN-0003", supplier_id: inv.supMep, warehouse_id: inv.whMain,
    receipt_date: "2025-07-18", status: "posted", received_by: u.store1, posted_at: "2025-07-18T13:20:00+03:00",
  });
  await db.insert(receiptItems).values([{ receipt_id: grn3, material_id: inv.matPipeDI, qty: "260", unit_cost: "88.000" }]);
  addLedger("receipt", inv.whMain, inv.matPipeDI, null, "260", "88.000", "receipt", "GRN-0003");

  const grn4 = newId();
  await db.insert(receipts).values({
    id: grn4, number: "GRN-0004", supplier_id: inv.supAgg, warehouse_id: inv.whMain,
    receipt_date: "2025-06-28", status: "posted", received_by: u.store1, posted_at: "2025-06-28T10:30:00+03:00",
  });
  await db.insert(receiptItems).values([{ receipt_id: grn4, material_id: inv.matAsphalt, qty: "300", unit_cost: "52.000" }]);
  addLedger("receipt", inv.whMain, inv.matAsphalt, null, "300", "52.000", "receipt", "GRN-0004");

  // A draft GRN (not posted yet)
  const grn5 = newId();
  await db.insert(receipts).values({
    id: grn5, number: "GRN-0005", supplier_id: inv.supBlocks, warehouse_id: inv.whIrb, project_id: ps.irb,
    receipt_date: "2025-08-02", status: "draft", received_by: u.store2,
  });
  await db.insert(receiptItems).values([{ receipt_id: grn5, material_id: inv.matBlocks, qty: "6000", unit_cost: "0.880" }]);

  // ---- Issues (posted) ----
  const iss1 = newId();
  await db.insert(issues).values({
    id: iss1, number: "ISS-0001", warehouse_id: inv.whMain, project_id: ps.abj,
    issue_date: "2025-05-20", status: "posted", issued_by: u.store1, requested_by: "Eng. Abdullah Yousef",
    purpose: "Basement slab reinforcement", posted_at: "2025-05-20T10:00:00+03:00",
  });
  await db.insert(issueItems).values([{ issue_id: iss1, material_id: inv.matSteel, qty: "30" }]);
  addLedger("issue", inv.whMain, inv.matSteel, ps.abj, "-30", "648.500", "issue", "ISS-0001");

  const iss2 = newId();
  await db.insert(issues).values({
    id: iss2, number: "ISS-0002", warehouse_id: inv.whAbj, project_id: ps.abj,
    issue_date: "2025-06-10", status: "posted", issued_by: u.store2, requested_by: "Eng. Mohammad Salameh",
    purpose: "Blockwork — floors 3-5", posted_at: "2025-06-10T08:40:00+03:00",
  });
  await db.insert(issueItems).values([{ issue_id: iss2, material_id: inv.matBlocks, qty: "4500" }]);
  addLedger("issue", inv.whAbj, inv.matBlocks, ps.abj, "-4500", "0.850", "issue", "ISS-0002");

  const iss3 = newId();
  await db.insert(issues).values({
    id: iss3, number: "ISS-0003", warehouse_id: inv.whAbj, project_id: ps.abj,
    issue_date: "2025-06-25", status: "posted", issued_by: u.store2, requested_by: "Eng. Abdullah Yousef",
    purpose: "Road base layer", posted_at: "2025-06-25T09:10:00+03:00",
  });
  await db.insert(issueItems).values([{ issue_id: iss3, material_id: inv.matAgg, qty: "260" }]);
  addLedger("issue", inv.whAbj, inv.matAgg, ps.abj, "-260", "6.400", "issue", "ISS-0003");

  // ---- Transfers (posted) ----
  // blocks moved from central warehouse to the ABJ site store before the blockwork issue
  const trn0 = newId();
  await db.insert(transfers).values({
    id: trn0, number: "TRN-0001", from_warehouse_id: inv.whMain, to_warehouse_id: inv.whAbj, project_id: ps.abj,
    transfer_date: "2025-06-05", status: "posted", created_by: u.store1, posted_at: "2025-06-05T09:00:00+03:00",
  });
  await db.insert(transferItems).values([{ transfer_id: trn0, material_id: inv.matBlocks, qty: "8000" }]);
  addLedger("transfer_out", inv.whMain, inv.matBlocks, ps.abj, "-8000", "0.850", "transfer", "TRN-0001");
  addLedger("transfer_in", inv.whAbj, inv.matBlocks, ps.abj, "8000", "0.850", "transfer", "TRN-0001");

  const trn1 = newId();
  await db.insert(transfers).values({
    id: trn1, number: "TRN-0002", from_warehouse_id: inv.whMain, to_warehouse_id: inv.whDsc, project_id: ps.dsc,
    transfer_date: "2025-07-05", status: "posted", created_by: u.store1, posted_at: "2025-07-05T14:00:00+03:00",
  });
  await db.insert(transferItems).values([
    { transfer_id: trn1, material_id: inv.matAsphalt, qty: "150" },
    { transfer_id: trn1, material_id: inv.matSteel, qty: "12" },
  ]);
  addLedger("transfer_out", inv.whMain, inv.matAsphalt, ps.dsc, "-150", "52.000", "transfer", "TRN-0002");
  addLedger("transfer_in", inv.whDsc, inv.matAsphalt, ps.dsc, "150", "52.000", "transfer", "TRN-0002");
  addLedger("transfer_out", inv.whMain, inv.matSteel, ps.dsc, "-12", "648.500", "transfer", "TRN-0002");
  addLedger("transfer_in", inv.whDsc, inv.matSteel, ps.dsc, "12", "648.500", "transfer", "TRN-0002");

  // ---- Supplier return (posted) ----
  const ret1 = newId();
  await db.insert(supplierReturns).values({
    id: ret1, number: "RET-0001", supplier_id: inv.supAgg, warehouse_id: inv.whAbj, project_id: ps.abj,
    return_date: "2025-06-28", status: "posted", reason: "Oversized aggregate fraction delivered", posted_at: "2025-06-28T12:00:00+03:00",
  });
  await db.insert(returnItems).values([{ return_id: ret1, material_id: inv.matAgg, qty: "18" }]);
  addLedger("supplier_return", inv.whAbj, inv.matAgg, ps.abj, "-18", "6.400", "supplier_return", "RET-0001");

  // ---- Adjustments ----
  // Controlled, posted (ABJ)
  const adj1 = newId();
  await db.insert(adjustments).values({
    id: adj1, number: "ADJ-0001", warehouse_id: inv.whAbj, project_id: ps.abj,
    adjustment_date: "2025-07-30", status: "posted", policy: "controlled",
    reason: "Physical count — 6 bags cement damaged by rain, disposed", notes: null,
    created_by: u.store2, submitted_at: "2025-07-30T09:00:00+03:00", approved_by: u.pm1, approved_at: "2025-07-30T15:00:00+03:00",
    posted_by: u.store2, posted_at: "2025-07-31T08:30:00+03:00",
  });
  await db.insert(adjustmentItems).values([{ adjustment_id: adj1, material_id: inv.matBlocks, qty_diff: "-320", note: "Broken blocks at stack base" }]);
  addLedger("adjustment", inv.whAbj, inv.matBlocks, ps.abj, "-320", null, "adjustment", "ADJ-0001", "Physical count — broken blocks");

  // Simple, posted (DSC policy simple)
  const adj2 = newId();
  await db.insert(adjustments).values({
    id: adj2, number: "ADJ-0002", warehouse_id: inv.whDsc, project_id: ps.dsc,
    adjustment_date: "2025-07-22", status: "posted", policy: "simple",
    reason: "Incoming asphalt weighbridge correction", notes: null,
    created_by: u.store2, posted_by: u.store2, posted_at: "2025-07-22T10:00:00+03:00",
  });
  await db.insert(adjustmentItems).values([{ adjustment_id: adj2, material_id: inv.matAsphalt, qty_diff: "12.5", note: "Weighbridge reconciliation" }]);
  addLedger("adjustment", inv.whDsc, inv.matAsphalt, ps.dsc, "12.5", null, "adjustment", "ADJ-0002", "Weighbridge reconciliation");

  // Controlled, pending approval (ABJ)
  const adj3 = newId();
  await db.insert(adjustments).values({
    id: adj3, number: "ADJ-0003", warehouse_id: inv.whAbj, project_id: ps.abj,
    adjustment_date: "2025-08-04", status: "submitted", policy: "controlled",
    reason: "Cycle count: sand stock short vs ledger", notes: "Awaiting PM review",
    created_by: u.store2, submitted_at: "2025-08-04T08:15:00+03:00",
  });
  await db.insert(adjustmentItems).values([{ adjustment_id: adj3, material_id: inv.matSand, qty_diff: "-24", note: "Cycle count variance" }]);

  await db.insert(stockTransactions).values(ledgerRows);
}

async function seedWirs(db: Db, ps: ProjectIds, boq: BoqIds, u: Users) {
  const item = (p: string, sec: string, idx: number) => boq[p][sec].items[idx];

  const wirDefs: {
    project: string; sec: string; itemIdx: number; number: string; location: string; zone?: string; floor?: string;
    qty: string; status: string; engineer: string; reviewer?: string; comment?: string; approvedQty?: string;
    submittedDaysAgo: number; reviewedDaysAgo?: number; desc?: string;
  }[] = [
    // ABJ — approved
    { project: ps.abj, sec: "01", itemIdx: 1, number: "WIR-001", location: "Basement B3 — Grid A1-D4", zone: "B3", qty: "2200", status: "approved", engineer: u.eng1, reviewer: u.qaqc, approvedQty: "2200", submittedDaysAgo: 120, reviewedDaysAgo: 118 },
    { project: ps.abj, sec: "02", itemIdx: 1, number: "WIR-002", location: "Basement raft — Stage 1", zone: "B3-B2", qty: "1400", status: "approved", engineer: u.eng2, reviewer: u.qaqc, approvedQty: "1385", comment: "Approved; 15 m³ reworked at Grid C2 after repair.", submittedDaysAgo: 96, reviewedDaysAgo: 94 },
    { project: ps.abj, sec: "02", itemIdx: 2, number: "WIR-003", location: "Columns — Level 1 to 2", floor: "L1-L2", qty: "310", status: "approved", engineer: u.eng1, reviewer: u.qaqc, approvedQty: "310", submittedDaysAgo: 70, reviewedDaysAgo: 68 },
    { project: ps.abj, sec: "02", itemIdx: 3, number: "WIR-004", location: "Slab Level 3", floor: "L3", qty: "720", status: "approved_with_comments", engineer: u.eng2, reviewer: u.qaqc, approvedQty: "720", comment: "Approved with comments: protect PT anchors during curing.", submittedDaysAgo: 45, reviewedDaysAgo: 43 },
    { project: ps.abj, sec: "03", itemIdx: 0, number: "WIR-005", location: "Blockwork — Floors 3-4", floor: "L3-L4", qty: "1850", status: "under_review", engineer: u.eng1, reviewer: u.qaqc, submittedDaysAgo: 3 },
    { project: ps.abj, sec: "03", itemIdx: 0, number: "WIR-006", location: "Blockwork — Floor 5", floor: "L5", qty: "950", status: "submitted", engineer: u.eng2, submittedDaysAgo: 1 },
    { project: ps.abj, sec: "04", itemIdx: 0, number: "WIR-007", location: "Tiling — Levels 1-2 apartments", floor: "L1-L2", qty: "620", status: "returned", engineer: u.eng1, reviewer: u.qaqc, comment: "Please resubmit with level tiles alignment check per detail F-12.", submittedDaysAgo: 8, reviewedDaysAgo: 6 },
    { project: ps.abj, sec: "02", itemIdx: 1, number: "WIR-008", location: "Basement raft — Stage 2", zone: "B2", qty: "900", status: "rejected", engineer: u.eng2, reviewer: u.qaqc, comment: "Concrete cover measured below spec at Grid B5. Rework required before reinspection.", submittedDaysAgo: 12, reviewedDaysAgo: 10 },
    { project: ps.abj, sec: "05", itemIdx: 1, number: "WIR-009", location: "Drainage rough-in — Level 1", floor: "L1", qty: "1", status: "draft", engineer: u.eng1, submittedDaysAgo: 0, desc: "Prepared, awaiting plumbing subcontractor test report." },

    // DSC — mix
    { project: ps.dsc, sec: "01", itemIdx: 0, number: "WIR-001", location: "Access road CH 0+000 – CH 4+000", qty: "28000", status: "approved", engineer: u.eng3, reviewer: u.qaqc, approvedQty: "28000", submittedDaysAgo: 88, reviewedDaysAgo: 86 },
    { project: ps.dsc, sec: "01", itemIdx: 1, number: "WIR-002", location: "Sub-base CH 0+000 – CH 4+000", qty: "28000", status: "approved", engineer: u.eng3, reviewer: u.qaqc, approvedQty: "28000", submittedDaysAgo: 72, reviewedDaysAgo: 70 },
    { project: ps.dsc, sec: "01", itemIdx: 2, number: "WIR-003", location: "Binder course CH 0+000 – CH 2+500", qty: "18000", status: "approved", engineer: u.eng3, reviewer: u.qaqc, approvedQty: "18000", submittedDaysAgo: 40, reviewedDaysAgo: 38 },
    { project: ps.dsc, sec: "02", itemIdx: 0, number: "WIR-004", location: "Gabion wall — sector B", qty: "420", status: "submitted", engineer: u.eng3, submittedDaysAgo: 2 },
    { project: ps.dsc, sec: "03", itemIdx: 0, number: "WIR-005", location: "Chalets 1-12 structural frame", qty: "12", status: "approved_with_comments", engineer: u.eng3, reviewer: u.qaqc, approvedQty: "12", comment: "Approved. Verify anchor bolt torque for chalets 13-24 before pouring.", submittedDaysAgo: 20, reviewedDaysAgo: 18 },

    // IRB
    { project: ps.irb, sec: "01", itemIdx: 1, number: "WIR-001", location: "Pad footings — Grid A-C / 1-8", qty: "260", status: "approved", engineer: u.eng4, reviewer: u.qaqc, approvedQty: "260", submittedDaysAgo: 150, reviewedDaysAgo: 148 },
    { project: ps.irb, sec: "02", itemIdx: 0, number: "WIR-002", location: "Steel frame — Warehouse 1", qty: "310", status: "approved", engineer: u.eng4, reviewer: u.qaqc, approvedQty: "310", submittedDaysAgo: 90, reviewedDaysAgo: 88 },
    { project: ps.irb, sec: "02", itemIdx: 1, number: "WIR-003", location: "Roof panels — Warehouse 1", qty: "6400", status: "under_review", engineer: u.eng4, reviewer: u.qaqc, submittedDaysAgo: 4 },
    { project: ps.irb, sec: "03", itemIdx: 0, number: "WIR-004", location: "Floor slab — Warehouse 1, bays 1-4", qty: "3000", status: "submitted", engineer: u.eng4, submittedDaysAgo: 1 },

    // ZAR
    { project: ps.zar, sec: "01", itemIdx: 1, number: "WIR-001", location: "Aeration basin 1 walls", qty: "1650", status: "approved", engineer: u.eng1, reviewer: u.qaqc, approvedQty: "1650", submittedDaysAgo: 210, reviewedDaysAgo: 208 },
    { project: ps.zar, sec: "01", itemIdx: 2, number: "WIR-002", location: "Clarifier 2 — floor slab", qty: "480", status: "approved", engineer: u.eng1, reviewer: u.qaqc, approvedQty: "480", submittedDaysAgo: 130, reviewedDaysAgo: 128 },
    { project: ps.zar, sec: "02", itemIdx: 0, number: "WIR-003", location: "Diffusers — Basin 1, zone A", qty: "1200", status: "submitted", engineer: u.eng1, submittedDaysAgo: 2 },
  ];

  const engineerNames: Record<string, string> = {};

  for (const wd of wirDefs) {
    const it = item(wd.project, wd.sec, wd.itemIdx);
    const id = newId();
    if (!engineerNames[wd.engineer]) {
      const [row] = await db.select({ name: users.name }).from(users).where(sql`${users.id} = ${wd.engineer}`).limit(1);
      engineerNames[wd.engineer] = row?.name ?? "Site Engineer";
    }
    const submittedAt = new Date(Date.now() - wd.submittedDaysAgo * 86400000).toISOString();
    const reviewedAt = wd.reviewedDaysAgo != null ? new Date(Date.now() - wd.reviewedDaysAgo * 86400000).toISOString() : null;
    await db.insert(wir).values({
      id,
      project_id: wd.project,
      boq_item_id: it.id,
      number: wd.number,
      location: wd.location,
      zone: wd.zone ?? null,
      floor: wd.floor ?? null,
      description: wd.desc ?? null,
      submitted_qty: wd.qty,
      unit: it.unit,
      engineer_id: wd.engineer,
      reviewer_id: wd.reviewer ?? null,
      status: wd.status as never,
      submitted_at: submittedAt,
      reviewed_at: reviewedAt,
      review_comment: wd.comment ?? null,
      approved_qty: wd.approvedQty ?? null,
      revision: 0,
    });
    const events: (typeof wirEvents.$inferInsert)[] = [{ wir_id: id, to_status: "draft", actor_id: wd.engineer, actor_name: engineerNames[wd.engineer], created_at: submittedAt }];
    if (wd.status !== "draft") {
      events.push({ wir_id: id, from_status: "draft", to_status: "submitted", actor_id: wd.engineer, actor_name: engineerNames[wd.engineer], created_at: submittedAt });
    }
    if (["under_review", "approved", "approved_with_comments", "returned", "rejected"].includes(wd.status)) {
      events.push({ wir_id: id, from_status: "submitted", to_status: "under_review", actor_id: wd.reviewer ?? u.qaqc, actor_name: "Eng. Omar Mashaqbeh", created_at: reviewedAt ?? submittedAt });
    }
    if (["approved", "approved_with_comments"].includes(wd.status)) {
      events.push({ wir_id: id, from_status: "under_review", to_status: wd.status as never, actor_id: wd.reviewer ?? u.qaqc, actor_name: "Eng. Omar Mashaqbeh", comment: wd.comment ?? null, created_at: reviewedAt ?? submittedAt, snapshot: { approved_qty: wd.approvedQty ?? wd.qty } });
    }
    if (wd.status === "returned") {
      events.push({ wir_id: id, from_status: "under_review", to_status: "returned", actor_id: wd.reviewer ?? u.qaqc, actor_name: "Eng. Omar Mashaqbeh", comment: wd.comment ?? null, created_at: reviewedAt ?? submittedAt });
    }
    if (wd.status === "rejected") {
      events.push({ wir_id: id, from_status: "under_review", to_status: "rejected", actor_id: wd.reviewer ?? u.qaqc, actor_name: "Eng. Omar Mashaqbeh", comment: wd.comment ?? null, created_at: reviewedAt ?? submittedAt });
    }
    await db.insert(wirEvents).values(events);
  }
}

async function seedDailyReports(db: Db, ps: ProjectIds, boq: BoqIds, u: Users, inv: InvIds) {
  const item = (p: string, sec: string, idx: number) => boq[p][sec].items[idx];

  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  const reports: {
    project: string; date: string; status: string; submitter: string; reviewer?: string;
    manpower: [string, number][];
    activities: { item: { id: string; code: string }; qty: string; unit: string; desc: string }[];
    materialsReceived?: { mat: string; name: string; qty: string; unit: string; supplier: string }[];
    delays?: string[];
    notes?: string;
  }[] = [
    {
      project: ps.abj, date: daysAgo(0), status: "submitted", submitter: u.eng1,
      manpower: [["Mason", 14], ["Steel Fixer", 6], ["Carpenter", 8], ["Unskilled", 12]],
      activities: [
        { item: item(ps.abj, "03", 0), qty: "260", unit: "m2", desc: "Blockwork Level 5 — continued" },
        { item: item(ps.abj, "04", 0), qty: "140", unit: "m2", desc: "Ceramic tiling Level 2" },
      ],
      materialsReceived: [{ mat: inv.matSand, name: "Plastering Sand", qty: "22", unit: "m3", supplier: "Al-Safwa Aggregates" }],
      notes: "Tower crane maintenance scheduled 07:00-09:00.",
    },
    {
      project: ps.abj, date: daysAgo(1), status: "approved", submitter: u.eng2, reviewer: u.pm1,
      manpower: [["Mason", 12], ["Steel Fixer", 8], ["Unskilled", 10]],
      activities: [{ item: item(ps.abj, "02", 3), qty: "185", unit: "m3", desc: "Slab Level 4 pour" }],
      delays: ["Concrete pump breakdown — 2h, pump supplier"],
    },
    {
      project: ps.abj, date: daysAgo(2), status: "approved", submitter: u.eng1, reviewer: u.pm1,
      manpower: [["Mason", 10], ["Carpenter", 6], ["Unskilled", 8]],
      activities: [{ item: item(ps.abj, "03", 0), qty: "230", unit: "m2", desc: "Blockwork Level 4" }],
    },
    {
      project: ps.dsc, date: daysAgo(0), status: "submitted", submitter: u.eng3,
      manpower: [["Roller Operator", 2], ["Paver Crew", 8], ["Unskilled", 6]],
      activities: [
        { item: item(ps.dsc, "01", 2), qty: "2200", unit: "m2", desc: "Binder course CH 2+500 – CH 3+000" },
        { item: item(ps.dsc, "02", 0), qty: "60", unit: "m3", desc: "Gabion wall sector B" },
      ],
      materialsReceived: [{ mat: inv.matAsphalt, name: "Asphalt Wearing Course Mix", qty: "340", unit: "ton", supplier: "Al-Safwa Aggregates" }],
      notes: "Site wind speed high in afternoon; paving stopped at 15:00 per safety limits.",
    },
    {
      project: ps.dsc, date: daysAgo(1), status: "submitted", submitter: u.eng3,
      manpower: [["Roller Operator", 1], ["Paver Crew", 8]],
      activities: [{ item: item(ps.dsc, "01", 2), qty: "1900", unit: "m2", desc: "Binder course CH 2+000 – CH 2+500" }],
    },
    {
      project: ps.irb, date: daysAgo(0), status: "submitted", submitter: u.eng4,
      manpower: [["Erector", 10], ["Welder", 4], ["Crane Operator", 2]],
      activities: [
        { item: item(ps.irb, "02", 0), qty: "18", unit: "ton", desc: "Steel erection — Warehouse 1, grid 6-8" },
        { item: item(ps.irb, "02", 1), qty: "900", unit: "m2", desc: "Roof panels — Warehouse 1" },
      ],
    },
    {
      project: ps.irb, date: daysAgo(1), status: "approved", submitter: u.eng4, reviewer: u.pm3,
      manpower: [["Erector", 8], ["Welder", 4]],
      activities: [{ item: item(ps.irb, "02", 0), qty: "21", unit: "ton", desc: "Steel erection — Warehouse 1, grid 3-5" }],
    },
    {
      project: ps.zar, date: daysAgo(0), status: "draft", submitter: u.eng1,
      manpower: [["Plumber", 6], ["Unskilled", 8]],
      activities: [{ item: item(ps.zar, "02", 0), qty: "380", unit: "nos", desc: "Diffuser installation Basin 1 zone B" }],
    },
  ];

  for (const rd of reports) {
    const id = newId();
    await db.insert(dailyReports).values({
      id,
      project_id: rd.project,
      report_date: rd.date,
      weather: { condition: "sunny", temp_min: 24, temp_max: 35 },
      notes: rd.notes ?? null,
      status: rd.status as never,
      submitted_by: rd.submitter,
      submitted_at: `${rd.date}T18:30:00+03:00`,
      reviewed_by: rd.reviewer ?? null,
      reviewed_at: rd.reviewer ? `${rd.date}T21:00:00+03:00` : null,
    });
    for (const [labor_type, count] of rd.manpower) {
      await db.execute(sql.raw(`insert into dr_manpower (report_id, labor_type, count) values ('${id}', '${labor_type}', ${count})`));
    }
    for (const a of rd.activities) {
      await db.execute(sql.raw(
        `insert into dr_activities (report_id, boq_item_id, description, qty, unit, applied_qty)
         values ('${id}', '${a.item.id}', '${a.desc.replace(/'/g, "''")}', ${a.qty}, '${a.unit}', ${rd.status === "draft" ? 0 : a.qty})`,
      ));
      if (rd.status !== "draft") {
        await db.execute(sql.raw(
          `update boq_items set executed_qty = executed_qty + ${a.qty} where id = '${a.item.id}'`,
        ));
      }
    }
    for (const m of rd.materialsReceived ?? []) {
      await db.execute(sql.raw(
        `insert into dr_material_received (report_id, material_id, name, qty, unit, supplier)
         values ('${id}', '${m.mat}', '${m.name.replace(/'/g, "''")}', ${m.qty}, '${m.unit}', '${m.supplier.replace(/'/g, "''")}')`,
      ));
    }
    for (const d of rd.delays ?? []) {
      await db.execute(sql.raw(
        `insert into dr_delays (report_id, description, duration_hours) values ('${id}', '${d.replace(/'/g, "''")}', 2)`,
      ));
    }
    await db.insert(drEvents).values({
      report_id: id,
      to_status: rd.status as never,
      actor_id: rd.submitter,
      actor_name: "Site Engineer",
      created_at: `${rd.date}T18:30:00+03:00`,
    });
    if (rd.reviewer) {
      await db.insert(drEvents).values({
        report_id: id,
        from_status: "submitted",
        to_status: "approved",
        actor_id: rd.reviewer,
        actor_name: "Project Manager",
        created_at: `${rd.date}T21:00:00+03:00`,
      });
    }
  }
}

async function seedExpenses(db: Db, ps: ProjectIds, u: Users) {
  const cats = await db.select().from(expenseCategories);
  const byName = (n: string) => cats.find((c) => c.name === n)?.id;

  const exps: {
    project: string; number: string; cat: string; supplier: string; date: string; amount: string; tax: string; method: string;
    status: string; createdBy: string; approvedBy?: string; desc?: string;
  }[] = [
    { project: ps.abj, number: "EXP-0001", cat: "Equipment Rental", supplier: "Jordan Crane Rentals", date: "2025-06-01", amount: "4200", tax: "672", method: "bank_transfer", status: "approved", createdBy: u.pm1, approvedBy: u.gm, desc: "Tower crane monthly rental — June" },
    { project: ps.abj, number: "EXP-0002", cat: "Fuel & Lubricants", supplier: "Total Jordan", date: "2025-06-18", amount: "1850", tax: "296", method: "cash", status: "approved", createdBy: u.eng1, approvedBy: u.gm, desc: "Diesel for site generators" },
    { project: ps.abj, number: "EXP-0003", cat: "Subcontractor Payments", supplier: "Jordan Formwork Co.", date: "2025-07-02", amount: "24500", tax: "3920", method: "cheque", status: "approved", createdBy: u.pm1, approvedBy: u.accountant, desc: "Formwork subcontractor — progress payment #4" },
    { project: ps.abj, number: "EXP-0004", cat: "Material Purchases", supplier: "Jordan Steel Trading Co.", date: "2025-07-15", amount: "55225", tax: "8836", method: "bank_transfer", status: "approved", createdBy: u.store1, approvedBy: u.accountant, desc: "Rebar supply — 85 ton" },
    { project: ps.abj, number: "EXP-0005", cat: "Site Overheads", supplier: "JEPCO", date: "2025-07-28", amount: "3200", tax: "512", method: "bank_transfer", status: "submitted", createdBy: u.eng1, desc: "Electricity bill — site connection" },
    { project: ps.abj, number: "EXP-0006", cat: "Material Purchases", supplier: "Yarmouk Blocks Factory", date: "2025-08-01", amount: "10200", tax: "1632", method: "cheque", status: "draft", createdBy: u.store2, desc: "Block supply — 12,000 nos" },
    { project: ps.dsc, number: "EXP-0001", cat: "Equipment Rental", supplier: "Dead Sea Equipment Co.", date: "2025-06-20", amount: "6800", tax: "1088", method: "bank_transfer", status: "approved", createdBy: u.pm2, approvedBy: u.gm, desc: "Motor grader + roller monthly rental" },
    { project: ps.dsc, number: "EXP-0002", cat: "Material Purchases", supplier: "Al-Safwa Aggregates", date: "2025-07-05", amount: "18300", tax: "2928", method: "bank_transfer", status: "approved", createdBy: u.store2, approvedBy: u.accountant, desc: "Asphalt mix supply" },
    { project: ps.dsc, number: "EXP-0003", cat: "Fuel & Lubricants", supplier: "Total Jordan", date: "2025-07-22", amount: "1400", tax: "224", method: "cash", status: "submitted", createdBy: u.eng3, desc: "Diesel — site fleet" },
    { project: ps.irb, number: "EXP-0001", cat: "Subcontractor Payments", supplier: "North Steel Erectors", date: "2025-07-10", amount: "38000", tax: "6080", method: "cheque", status: "approved", createdBy: u.pm3, approvedBy: u.gm, desc: "Steel erection — progress payment #2" },
    { project: ps.irb, number: "EXP-0002", cat: "Equipment Rental", supplier: "Irbid Crane Services", date: "2025-07-25", amount: "3900", tax: "624", method: "bank_transfer", status: "submitted", createdBy: u.store2, desc: "Mobile crane rental" },
    { project: ps.zar, number: "EXP-0001", cat: "Material Purchases", supplier: "Amman HVAC & Plumbing Supplies", date: "2025-06-30", amount: "25600", tax: "4096", method: "bank_transfer", status: "approved", createdBy: u.store2, approvedBy: u.accountant, desc: "Ductile iron pipe DN300" },
    { project: ps.zar, number: "EXP-0002", cat: "Consultant Fees", supplier: "ILF Consulting Engineers", date: "2025-07-31", amount: "15000", tax: "0", method: "bank_transfer", status: "approved", createdBy: u.pm1, approvedBy: u.owner, desc: "Supervision fees — monthly" },
  ];

  for (const e of exps) {
    const id = newId();
    await db.insert(expenses).values({
      id,
      project_id: e.project,
      number: e.number,
      category_id: byName(e.cat) ?? null,
      supplier_name: e.supplier,
      expense_date: e.date,
      amount: e.amount,
      tax_amount: e.tax,
      total: mulMoney(e.amount, "1") /* computed below */,
      payment_method: e.method as never,
      description: e.desc ?? null,
      status: e.status as never,
      created_by: e.createdBy,
      submitted_at: e.status !== "draft" ? `${e.date}T10:00:00+03:00` : null,
      approved_by: e.approvedBy ?? null,
      approved_at: e.approvedBy ? `${e.date}T16:00:00+03:00` : null,
    });
    await db.execute(sql.raw(`update expenses set total = ${parseFloat(e.amount) + parseFloat(e.tax)} where id = '${id}'`));
  }
}

async function seedDocuments(db: Db, ps: ProjectIds, u: Users) {
  const docs: { project: string | null; kind: string; title: string; revision: string; series: string; discipline: string | null; date: string | null }[] = [
    { project: ps.abj, kind: "drawing", title: "Basement 3 General Layout Plan", revision: "B", series: "ABJ-ARC-100", discipline: "Architectural", date: "2025-01-20" },
    { project: ps.abj, kind: "drawing", title: "Raft Foundation Details — Stage 2", revision: "A", series: "ABJ-STR-201", discipline: "Structural", date: "2025-02-10" },
    { project: ps.abj, kind: "drawing", title: "Post-Tensioning Layout — Slab L4", revision: "C", series: "ABJ-STR-310", discipline: "Structural", date: "2025-05-15" },
    { project: ps.abj, kind: "document", title: "Concrete Mix Design Approval — C40", revision: "A", series: "ABJ-QA-001", discipline: "QA/QC", date: "2025-01-05" },
    { project: ps.dsc, kind: "drawing", title: "Access Road Alignment Plan CH 0–12 km", revision: "B", series: "DSC-CIV-001", discipline: "Civil", date: "2025-03-01" },
    { project: ps.dsc, kind: "document", title: "Asphalt Job Mix Formula — Binder Course", revision: "A", series: "DSC-QA-002", discipline: "QA/QC", date: "2025-04-10" },
    { project: ps.irb, kind: "drawing", title: "Warehouse 1 Steel Framing Plan", revision: "A", series: "IRB-STR-100", discipline: "Structural", date: "2025-02-20" },
    { project: ps.zar, kind: "drawing", title: "Aeration Basin 2 — General Arrangement", revision: "B", series: "ZAR-PRC-210", discipline: "Process", date: "2024-11-15" },
    { project: ps.aqj, kind: "document", title: "Container Yard Pavement Specification", revision: "A", series: "AQJ-SPC-001", discipline: "Civil", date: "2025-04-05" },
  ];

  for (const d of docs) {
    const fileId = newId();
    const docId = newId();
    await db.insert(files).values({
      id: fileId,
      name: `${d.title.replace(/[^a-z0-9]+/gi, "-")}-rev-${d.revision}.pdf`,
      mime: "application/pdf",
      size: 2_400_000,
      storage_provider: "local",
      storage_key: `seed/${docId}.pdf`,
      uploaded_by: u.superAdmin,
    });
    await db.insert(documents).values({
      id: docId,
      project_id: d.project,
      kind: d.kind as never,
      title: d.title,
      discipline: d.discipline,
      revision: d.revision,
      series_key: d.series,
      status: "current",
      file_id: fileId,
      uploaded_by: u.superAdmin,
      issue_date: d.date,
    });
  }
}

async function seedAudit(db: Db) {
  const approvedWirs = await db
    .select({
      id: wir.id,
      project_id: wir.project_id,
      number: wir.number,
      reviewer_id: wir.reviewer_id,
      reviewed_at: wir.reviewed_at,
    })
    .from(wir)
    .where(sql`${wir.status} in ('approved','approved_with_comments')`);
  const reviewerNames = new Map<string, string>();
  for (const w of approvedWirs) {
    if (!w.reviewer_id || !w.reviewed_at) continue;
    let name = reviewerNames.get(w.reviewer_id);
    if (!name) {
      const [row] = await db.select({ name: users.name }).from(users).where(sql`${users.id} = ${w.reviewer_id}`).limit(1);
      name = row?.name ?? "QA/QC Engineer";
      reviewerNames.set(w.reviewer_id, name);
    }
    await db.insert(auditLogs).values({
      actor_id: w.reviewer_id,
      actor_name: name,
      actor_role: "qa_qc",
      action: "approved",
      entity_type: "wir",
      entity_id: w.id,
      project_id: w.project_id,
      after: { number: w.number, status: "approved" },
      created_at: w.reviewed_at,
    });
  }

  const postedDocs = await db
    .select({ id: receipts.id, project_id: receipts.project_id, number: receipts.number, posted_at: receipts.posted_at })
    .from(receipts)
    .where(sql`${receipts.status} = 'posted'`);
  for (const d of postedDocs) {
    if (!d.posted_at) continue;
    await db.insert(auditLogs).values({
      actor_name: "Khalid Haddad",
      actor_role: "storekeeper",
      action: "posted",
      entity_type: "receipt",
      entity_id: d.id,
      project_id: d.project_id,
      after: { number: d.number },
      created_at: d.posted_at,
    });
  }

  const approvedExpenses = await db
    .select({ id: expenses.id, project_id: expenses.project_id, number: expenses.number, approved_by: expenses.approved_by, approved_at: expenses.approved_at })
    .from(expenses)
    .where(sql`${expenses.status} = 'approved'`);
  for (const e of approvedExpenses) {
    if (!e.approved_by || !e.approved_at) continue;
    await db.insert(auditLogs).values({
      actor_id: e.approved_by,
      actor_name: "Approver",
      actor_role: "accountant",
      action: "approved",
      entity_type: "expense",
      entity_id: e.id,
      project_id: e.project_id,
      after: { number: e.number },
      created_at: e.approved_at,
    });
  }
}

async function backdate(db: Db) {
  // nothing needed here; seed rows already carry realistic dates
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
