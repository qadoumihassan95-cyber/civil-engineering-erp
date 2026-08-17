import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  jsonb,
  boolean,
  integer,
  date,
  index,
  uniqueIndex,
  primaryKey,
  bigserial,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "owner",
  "general_manager",
  "project_manager",
  "site_engineer",
  "qa_qc",
  "quantity_surveyor",
  "storekeeper",
  "accountant",
  "auditor",
  "viewer",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const wirStatusEnum = pgEnum("wir_status", [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "approved_with_comments",
  "returned",
  "rejected",
]);

export const drStatusEnum = pgEnum("daily_report_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const expenseStatusEnum = pgEnum("expense_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "posted",
]);

export const postingStatusEnum = pgEnum("posting_status", ["draft", "posted", "void"]);

export const txnTypeEnum = pgEnum("txn_type", [
  "receipt",
  "issue",
  "transfer_in",
  "transfer_out",
  "supplier_return",
  "adjustment",
]);

export const docKindEnum = pgEnum("doc_kind", [
  "drawing",
  "document",
  "photo",
  "report",
]);

export const docStatusEnum = pgEnum("doc_status", ["current", "superseded"]);

const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
};

const money = (name: string) => numeric(name, { precision: 18, scale: 3 });
const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });

// ---------------------------------------------------------------------------
// Users, sessions
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 190 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    role: userRoleEnum("role").notNull().default("viewer"),
    password_hash: text("password_hash").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    locale: varchar("locale", { length: 5 }).default("en").notNull(),
    last_login_at: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Projects & membership
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    client_name: varchar("client_name", { length: 200 }),
    consultant_name: varchar("consultant_name", { length: 200 }),
    contractor_name: varchar("contractor_name", { length: 200 }),
    location: varchar("location", { length: 250 }),
    currency: varchar("currency", { length: 3 }).default("JOD").notNull(),
    contract_value: money("contract_value").default("0").notNull(),
    start_date: date("start_date", { mode: "string" }),
    planned_end_date: date("planned_end_date", { mode: "string" }),
    actual_end_date: date("actual_end_date", { mode: "string" }),
    status: projectStatusEnum("status").default("planning").notNull(),
    manager_id: uuid("manager_id").references(() => users.id),
    settings: jsonb("settings").$type<ProjectSettings>().default({}).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_code_uq").on(t.code), index("projects_status_idx").on(t.status)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigned_at: timestamp("assigned_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.project_id, t.user_id] })],
);

// ---------------------------------------------------------------------------
// BOQ
// ---------------------------------------------------------------------------

export const boqSections = pgTable(
  "boq_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    title: varchar("title", { length: 250 }).notNull(),
    sort: integer("sort").default(0).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("boq_sections_project_code_uq").on(t.project_id, t.code)],
);

export const boqItems = pgTable(
  "boq_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    section_id: uuid("section_id").references(() => boqSections.id, { onDelete: "set null" }),
    code: varchar("code", { length: 40 }).notNull(),
    description: text("description").notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    contract_qty: qty("contract_qty").notNull(),
    unit_rate: money("unit_rate").notNull(),
    contract_amount: money("contract_amount").notNull(),
    executed_qty: qty("executed_qty").default("0").notNull(),
    certified_qty: qty("certified_qty"),
    sort: integer("sort").default(0).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("boq_items_project_code_uq").on(t.project_id, t.code),
    index("boq_items_section_idx").on(t.section_id),
    check("boq_items_qty_nonneg", sql`${t.contract_qty} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// WIR
// ---------------------------------------------------------------------------

export const wir = pgTable(
  "wir",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    boq_item_id: uuid("boq_item_id")
      .notNull()
      .references(() => boqItems.id),
    number: varchar("number", { length: 20 }).notNull(),
    location: varchar("location", { length: 250 }).notNull(),
    zone: varchar("zone", { length: 120 }),
    floor: varchar("floor", { length: 120 }),
    description: text("description"),
    submitted_qty: qty("submitted_qty").notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    engineer_id: uuid("engineer_id")
      .notNull()
      .references(() => users.id),
    reviewer_id: uuid("reviewer_id").references(() => users.id),
    status: wirStatusEnum("status").default("draft").notNull(),
    submitted_at: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    review_comment: text("review_comment"),
    approved_qty: qty("approved_qty"),
    revision: integer("revision").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("wir_project_number_uq").on(t.project_id, t.number),
    index("wir_project_status_idx").on(t.project_id, t.status),
    check("wir_qty_positive", sql`${t.submitted_qty} > 0`),
  ],
);

export const wirEvents = pgTable(
  "wir_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    wir_id: uuid("wir_id")
      .notNull()
      .references(() => wir.id, { onDelete: "cascade" }),
    from_status: wirStatusEnum("from_status"),
    to_status: wirStatusEnum("to_status").notNull(),
    actor_id: uuid("actor_id").references(() => users.id),
    actor_name: varchar("actor_name", { length: 120 }).notNull(),
    comment: text("comment"),
    snapshot: jsonb("snapshot"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("wir_events_wir_idx").on(t.wir_id)],
);

// ---------------------------------------------------------------------------
// Daily reports
// ---------------------------------------------------------------------------

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    report_date: date("report_date", { mode: "string" }).notNull(),
    weather: jsonb("weather").$type<WeatherInfo>().default({}).notNull(),
    site_conditions: text("site_conditions"),
    notes: text("notes"),
    status: drStatusEnum("status").default("draft").notNull(),
    submitted_by: uuid("submitted_by").references(() => users.id),
    submitted_at: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    reviewed_by: uuid("reviewed_by").references(() => users.id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    review_comment: text("review_comment"),
    ...timestamps,
  },
  (t) => [uniqueIndex("dr_project_date_uq").on(t.project_id, t.report_date)],
);

export const drManpower = pgTable("dr_manpower", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  labor_type: varchar("labor_type", { length: 120 }).notNull(),
  count: integer("count").notNull(),
});

export const drSubcontractors = pgTable("dr_subcontractors", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  crew_count: integer("crew_count"),
  work_done: text("work_done"),
});

export const drEquipment = pgTable("dr_equipment", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  hours: numeric("hours", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

export const drActivities = pgTable("dr_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  boq_item_id: uuid("boq_item_id").references(() => boqItems.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  unit: varchar("unit", { length: 30 }),
  location: varchar("location", { length: 250 }),
  applied_qty: qty("applied_qty").default("0").notNull(),
});

export const drMaterialReceived = pgTable("dr_material_received", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  material_id: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
  name: varchar("name", { length: 150 }).notNull(),
  qty: qty("qty").notNull(),
  unit: varchar("unit", { length: 30 }),
  supplier: varchar("supplier", { length: 200 }),
});

export const drMaterialConsumed = pgTable("dr_material_consumed", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  material_id: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
  name: varchar("name", { length: 150 }).notNull(),
  qty: qty("qty").notNull(),
  unit: varchar("unit", { length: 30 }),
  source: varchar("source", { length: 150 }),
});

export const drDelays = pgTable("dr_delays", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  duration_hours: numeric("duration_hours", { precision: 10, scale: 2 }),
  party: varchar("party", { length: 150 }),
});

export const drIncidents = pgTable("dr_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 30 }),
  action_taken: text("action_taken"),
});

export const drSafety = pgTable("dr_safety", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  observation: text("observation").notNull(),
  action: text("action"),
});

export const drVisitors = pgTable("dr_visitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id")
    .notNull()
    .references(() => dailyReports.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  organization: varchar("organization", { length: 200 }),
  purpose: text("purpose"),
});

export const drEvents = pgTable(
  "dr_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    report_id: uuid("report_id")
      .notNull()
      .references(() => dailyReports.id, { onDelete: "cascade" }),
    from_status: drStatusEnum("from_status"),
    to_status: drStatusEnum("to_status").notNull(),
    actor_id: uuid("actor_id").references(() => users.id),
    actor_name: varchar("actor_name", { length: 120 }).notNull(),
    comment: text("comment"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("dr_events_report_idx").on(t.report_id)],
);

// ---------------------------------------------------------------------------
// Materials & inventory
// ---------------------------------------------------------------------------

export const materialCategories = pgTable("material_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  name_ar: varchar("name_ar", { length: 120 }),
  is_active: boolean("is_active").default(true).notNull(),
});

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    name_ar: varchar("name_ar", { length: 200 }),
    category_id: uuid("category_id").references(() => materialCategories.id),
    unit: varchar("unit", { length: 30 }).notNull(),
    description: text("description"),
    min_stock: qty("min_stock").default("0").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("materials_code_uq").on(t.code)],
);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contact_person: varchar("contact_person", { length: 120 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 150 }),
  address: varchar("address", { length: 250 }),
  tax_number: varchar("tax_number", { length: 40 }),
  is_active: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    name_ar: varchar("name_ar", { length: 150 }),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    is_active: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("warehouses_code_uq").on(t.code)],
);

export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    txn_type: txnTypeEnum("txn_type").notNull(),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    material_id: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    qty: qty("qty").notNull(),
    unit_cost: money("unit_cost"),
    ref_type: varchar("ref_type", { length: 40 }).notNull(),
    ref_id: varchar("ref_id", { length: 60 }).notNull(),
    note: text("note"),
    posted_by: uuid("posted_by").references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("stx_wh_mat_idx").on(t.warehouse_id, t.material_id),
    index("stx_ref_idx").on(t.ref_type, t.ref_id),
    index("stx_project_idx").on(t.project_id),
    check("stx_qty_nonzero", sql`${t.qty} <> 0`),
    check(
      "stx_inbound_sign",
      sql`(${t.txn_type} in ('receipt','transfer_in') and ${t.qty} > 0) or ${t.txn_type} not in ('receipt','transfer_in')`,
    ),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 20 }).notNull(),
    supplier_id: uuid("supplier_id").references(() => suppliers.id),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    receipt_date: date("receipt_date", { mode: "string" }).notNull(),
    status: postingStatusEnum("status").default("draft").notNull(),
    received_by: uuid("received_by").references(() => users.id),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    posted_at: timestamp("posted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [uniqueIndex("receipts_number_uq").on(t.number)],
);

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  receipt_id: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty: qty("qty").notNull(),
  unit_cost: money("unit_cost"),
  note: text("note"),
});

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 20 }).notNull(),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issue_date: date("issue_date", { mode: "string" }).notNull(),
    status: postingStatusEnum("status").default("draft").notNull(),
    issued_by: uuid("issued_by").references(() => users.id),
    requested_by: varchar("requested_by", { length: 150 }),
    purpose: text("purpose"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    posted_at: timestamp("posted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [uniqueIndex("issues_number_uq").on(t.number)],
);

export const issueItems = pgTable("issue_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  issue_id: uuid("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty: qty("qty").notNull(),
  note: text("note"),
});

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 20 }).notNull(),
    from_warehouse_id: uuid("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    to_warehouse_id: uuid("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    transfer_date: date("transfer_date", { mode: "string" }).notNull(),
    status: postingStatusEnum("status").default("draft").notNull(),
    created_by: uuid("created_by").references(() => users.id),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    posted_at: timestamp("posted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [uniqueIndex("transfers_number_uq").on(t.number)],
);

export const transferItems = pgTable("transfer_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  transfer_id: uuid("transfer_id")
    .notNull()
    .references(() => transfers.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty: qty("qty").notNull(),
  note: text("note"),
});

export const supplierReturns = pgTable(
  "supplier_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 20 }).notNull(),
    supplier_id: uuid("supplier_id").references(() => suppliers.id),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    return_date: date("return_date", { mode: "string" }).notNull(),
    status: postingStatusEnum("status").default("draft").notNull(),
    reason: text("reason"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    posted_at: timestamp("posted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [uniqueIndex("supplier_returns_number_uq").on(t.number)],
);

export const returnItems = pgTable("return_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  return_id: uuid("return_id")
    .notNull()
    .references(() => supplierReturns.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty: qty("qty").notNull(),
  note: text("note"),
});

export const adjustments = pgTable(
  "adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 20 }).notNull(),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    adjustment_date: date("adjustment_date", { mode: "string" }).notNull(),
    status: adjustmentStatusEnum("status").default("draft").notNull(),
    policy: varchar("policy", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    evidence_file_id: uuid("evidence_file_id").references(() => files.id),
    created_by: uuid("created_by").references(() => users.id),
    submitted_at: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    approved_by: uuid("approved_by").references(() => users.id),
    approved_at: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    posted_by: uuid("posted_by").references(() => users.id),
    posted_at: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("adjustments_number_uq").on(t.number)],
);

export const adjustmentItems = pgTable("adjustment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  adjustment_id: uuid("adjustment_id")
    .notNull()
    .references(() => adjustments.id, { onDelete: "cascade" }),
  material_id: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  qty_diff: qty("qty_diff").notNull(),
  note: text("note"),
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  name_ar: varchar("name_ar", { length: 120 }),
  is_active: boolean("is_active").default(true).notNull(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: varchar("number", { length: 20 }).notNull(),
    category_id: uuid("category_id").references(() => expenseCategories.id),
    supplier_id: uuid("supplier_id").references(() => suppliers.id),
    supplier_name: varchar("supplier_name", { length: 200 }),
    expense_date: date("expense_date", { mode: "string" }).notNull(),
    amount: money("amount").notNull(),
    tax_amount: money("tax_amount").default("0").notNull(),
    total: money("total").notNull(),
    currency: varchar("currency", { length: 3 }).default("JOD").notNull(),
    payment_method: varchar("payment_method", { length: 30 }).notNull(),
    reference_no: varchar("reference_no", { length: 60 }),
    description: text("description"),
    status: expenseStatusEnum("status").default("draft").notNull(),
    created_by: uuid("created_by").references(() => users.id),
    submitted_at: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    approved_by: uuid("approved_by").references(() => users.id),
    approved_at: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    review_comment: text("review_comment"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("expenses_project_number_uq").on(t.project_id, t.number),
    check("expenses_amount_nonneg", sql`${t.amount} >= 0`),
    check("expenses_tax_nonneg", sql`${t.tax_amount} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Files & documents
// ---------------------------------------------------------------------------

export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 250 }).notNull(),
  mime: varchar("mime", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  storage_provider: varchar("storage_provider", { length: 30 }).notNull(),
  storage_key: varchar("storage_key", { length: 400 }).notNull(),
  checksum: varchar("checksum", { length: 64 }),
  uploaded_by: uuid("uploaded_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

export const entityFiles = pgTable(
  "entity_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entity_type: varchar("entity_type", { length: 40 }).notNull(),
    entity_id: uuid("entity_id").notNull(),
    file_id: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("entity_files_lookup_idx").on(t.entity_type, t.entity_id)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: docKindEnum("kind").notNull(),
    title: varchar("title", { length: 250 }).notNull(),
    description: text("description"),
    discipline: varchar("discipline", { length: 60 }),
    revision: varchar("revision", { length: 20 }).default("A").notNull(),
    series_key: varchar("series_key", { length: 60 }).notNull(),
    status: docStatusEnum("status").default("current").notNull(),
    file_id: uuid("file_id")
      .notNull()
      .references(() => files.id),
    uploaded_by: uuid("uploaded_by").references(() => users.id),
    issue_date: date("issue_date", { mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("documents_project_idx").on(t.project_id, t.kind)],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actor_name: varchar("actor_name", { length: 120 }),
    actor_role: varchar("actor_role", { length: 40 }),
    action: varchar("action", { length: 60 }).notNull(),
    entity_type: varchar("entity_type", { length: 40 }).notNull(),
    entity_id: varchar("entity_id", { length: 60 }).notNull(),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: varchar("ip", { length: 60 }),
    user_agent: varchar("user_agent", { length: 300 }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_created_idx").on(t.created_at),
    index("audit_entity_idx").on(t.entity_type, t.entity_id),
    index("audit_project_idx").on(t.project_id),
  ],
);

export const orgSettings = pgTable("org_settings", {
  key: varchar("key", { length: 60 }).primaryKey(),
  value: jsonb("value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const projectsRelations = relations(projects, ({ many, one }) => ({
  members: many(projectMembers),
  boqSections: many(boqSections),
  manager: one(users, { fields: [projects.manager_id], references: [users.id] }),
}));

export const boqSectionsRelations = relations(boqSections, ({ one, many }) => ({
  project: one(projects, { fields: [boqSections.project_id], references: [projects.id] }),
  items: many(boqItems),
}));

export const boqItemsRelations = relations(boqItems, ({ one, many }) => ({
  project: one(projects, { fields: [boqItems.project_id], references: [projects.id] }),
  section: one(boqSections, { fields: [boqItems.section_id], references: [boqSections.id] }),
  wirs: many(wir),
}));

export const wirRelations = relations(wir, ({ one, many }) => ({
  project: one(projects, { fields: [wir.project_id], references: [projects.id] }),
  boqItem: one(boqItems, { fields: [wir.boq_item_id], references: [boqItems.id] }),
  engineer: one(users, { fields: [wir.engineer_id], references: [users.id] }),
  reviewer: one(users, { fields: [wir.reviewer_id], references: [users.id] }),
  events: many(wirEvents),
}));

export const dailyReportsRelations = relations(dailyReports, ({ one }) => ({
  project: one(projects, { fields: [dailyReports.project_id], references: [projects.id] }),
}));

export const materialsRelations = relations(materials, ({ one }) => ({
  category: one(materialCategories, {
    fields: [materials.category_id],
    references: [materialCategories.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.project_id], references: [projects.id] }),
  category: one(expenseCategories, {
    fields: [expenses.category_id],
    references: [expenseCategories.id],
  }),
  creator: one(users, { fields: [expenses.created_by], references: [users.id] }),
  approver: one(users, { fields: [expenses.approved_by], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, { fields: [documents.project_id], references: [projects.id] }),
  file: one(files, { fields: [documents.file_id], references: [files.id] }),
}));

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ProjectSettings {
  dailyReportApproval?: "manager" | "none";
  stockAdjustmentPolicy?: "simple" | "controlled";
  allowNegativeStock?: boolean;
}

export interface WeatherInfo {
  condition?: string;
  temp_min?: number;
  temp_max?: number;
  wind?: string;
}

export type UserRole =
  (typeof userRoleEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type WirStatus = (typeof wirStatusEnum.enumValues)[number];
export type DrStatus = (typeof drStatusEnum.enumValues)[number];
export type ExpenseStatus = (typeof expenseStatusEnum.enumValues)[number];
export type AdjustmentStatus = (typeof adjustmentStatusEnum.enumValues)[number];
export type PostingStatus = (typeof postingStatusEnum.enumValues)[number];
export type TxnType = (typeof txnTypeEnum.enumValues)[number];

export type { AnyPgColumn };
