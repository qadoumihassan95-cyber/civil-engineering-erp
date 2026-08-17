# CivilERP — Architecture & Business Rules

## Domain model (core tables)

```
projects ──┬─ project_members (RBAC project access)
           ├─ boq_sections ── boq_items (contract qty/rate, executed_qty, certified_qty)
           ├─ wir (state machine) ── wir_events (immutable history)
           ├─ daily_reports ── dr_manpower/subcontractors/equipment/activities(…)
           ├─ expenses ── entity_files (receipts)
           ├─ documents (drawings with revisions via series_key) ── files
           ├─ warehouses (site stores linked to project)
           └─ stock_transactions (immutable ledger) ← receipts/issues/transfers/returns/adjustments
```

- `files` stores metadata (provider, key, checksum); `entity_files` links files to any entity.
- `audit_logs` is append-only; every important mutation writes an entry inside the same transaction.
- `org_settings` reserved for future org-wide settings.

## Workflow state machines

- WIR: draft → submitted → under_review → approved | approved_with_comments | returned | rejected; returned → submitted (revision++).
- Daily report: draft → submitted → (approved | rejected) when policy=manager; submission is final when policy=none.
- Expense: draft → submitted → approved | rejected.
- Adjustment (controlled): draft → submitted → approved → posted (terminal); (simple): draft → posted.
- Inventory documents: draft → posted (terminal); drafts deletable, posted immutable.

## Quantity integrity

- BOQ approved_qty = Σ approved WIR qty (single source of truth; approvals are one-way transitions).
- BOQ executed_qty = Σ applied daily-report activity quantities (`applied_qty` delta bookkeeping).
- BOQ certified_qty = QS entry (audited).
- Submission blocks over-committing against contract quantity; approval blocks exceeding submitted qty; variation cannot shrink contract below approved.
- All arithmetic uses `decimal.js`; quantities NUMERIC(18,4), money NUMERIC(18,3).

## Inventory integrity

- Stock = Σ ledger per (warehouse, material) — computed, never stored.
- Ledger rows are append-only (services never update/delete; DB trigger rejects UPDATE/DELETE).
- Posting validates stock (or explicit project negative-stock policy).

## Separation of duties (enforced server-side)

- WIR: engineer ≠ reviewer (super admin exempt).
- Daily report: submitter ≠ approver (super admin exempt).
- Expense: creator ≠ approver.
- Adjustment: creator ≠ approver, and approver role ∈ {PM, GM, accountant, owner, super admin}.

## Migration & seed

- `npm run db:generate` → `drizzle/`, applied via `npm run db:migrate`.
- Custom migration `0001_stock_ledger_guard.sql` adds the immutability trigger.
- `npm run db:seed` truncates and re-creates demo data (idempotent).
