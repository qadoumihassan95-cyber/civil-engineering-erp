# CivilERP — Civil Engineering / Construction ERP

A production-oriented ERP for civil engineering and construction companies: projects, BOQ, WIR inspections, daily site reports, inventory, stock adjustments, expenses, documents, approvals, project controls, audit trail, and bilingual (Arabic RTL / English LTR) UI.

Built from scratch with **Next.js 15 (App Router) + TypeScript + PostgreSQL + Drizzle ORM**, deployable to **Render with managed PostgreSQL**.

---

## Quick start

```bash
# 1. PostgreSQL (Docker, for local development)
docker run -d --name civil-erp-db \
  -e POSTGRES_USER=civil -e POSTGRES_PASSWORD=civil_dev_pw_2026 \
  -e POSTGRES_DB=civil_erp -p 5433:5432 postgres:16-alpine
docker exec civil-erp-db psql -U civil -d civil_erp -c "CREATE DATABASE civil_erp_test OWNER civil;"

# 2. Install
npm install

# 3. Environment
cp .env.example .env          # then set AUTH_SECRET (openssl rand -base64 48)

# 4. Database + seed
npm run db:migrate
npm run db:seed

# 5. Run
npm run dev                   # http://localhost:3000
```

### Demo accounts (password: `Password123!`)

| Role | Email |
|---|---|
| Super Admin | admin@civilerp.io |
| Owner | owner@civilerp.io |
| General Manager | gm@civilerp.io |
| Project Manager | pm.amman@civilerp.io · pm.deadsea@civilerp.io · pm.irbid@civilerp.io |
| Site Engineer | eng.abdullah@civilerp.io · eng.mohammad@civilerp.io · eng.hamza@civilerp.io · eng.rawan@civilerp.io |
| QA/QC | qaqc@civilerp.io |
| Quantity Surveyor | qs@civilerp.io |
| Storekeeper | store.central@civilerp.io · store.site@civilerp.io |
| Accountant | accountant@civilerp.io |
| Auditor | auditor@civilerp.io |
| Viewer | viewer@civilerp.io |

The seed creates 5 realistic Jordanian projects (Abdali tower, Dead Sea resort, Irbid warehouses, Zarqa WWTP, Aqaba port), BOQs, WIRs in every lifecycle state, daily reports, inventory movements, stock adjustments under both policies, and expenses in every status.

---

## Architecture

```
src/
  db/            Drizzle schema (40+ tables), client, migrations
  server/
    auth/        sessions (JWT via jose), passwords (bcryptjs), RBAC matrix,
                 rate limiting, project access guards
    api/         route wrapper: auth + CSRF + zod validation + JSON errors
    services/    business logic (transactional, permission-checked)
                 projects, boq, wir, dailyReports, inventory, movements,
                 adjustments, expenses, documents, audit, stats, search,
                 importExport
    storage/     file storage abstraction (local now, S3 interface ready)
    i18n/        en/ar dictionaries, t(), number/date/currency formatting    lib/         decimal.js math helpers, ids, csv, errors
  app/           Next.js App Router pages + API routes
  components/    UI primitives + domain components (RTL-aware, Tailwind 4)
  middleware.ts  auth gate, redirects
scripts/seed.ts  realistic demo data (idempotent)
tests/           Vitest business-logic suites (uses civil_erp_test DB)
```

**Key decisions**

- **All business rules live server-side.** The UI is a thin client over service functions. Tests exercise the services directly against PostgreSQL.
- **Money and quantities are stored as PostgreSQL `NUMERIC`** (money 3dp / qty 4dp) and handled with `decimal.js` in application code — no floating point in financial or quantity math.
- **Stock ledger is immutable.** `stock_transactions` rows are created once, never updated/deleted; a database trigger (`drizzle/0001_stock_ledger_guard.sql`) rejects UPDATE/DELETE as defense in depth.
- **Approved quantities are derived, never stored twice.** A BOQ item's approved quantity is the SUM of approved WIRs — the WIR state machine (Draft → Submitted → Under Review → Approved / Approved with Comments / Returned / Rejected) is the single source of truth, making double counting structurally impossible.
- **Executed ≠ approved ≠ certified.** Executed quantities come from daily report activities (applied on submission, reverted on rejection), approved from WIR decisions, certified is set by the quantity surveyor. All shown separately in project controls.

---

## Business rules & invariants

### WIR workflow
- Transitions: `draft → submitted → under_review → approved | approved_with_comments | returned | rejected`; `returned → submitted` (revision++).
- Submitting checks: `submitted_qty ≤ contract_qty − committed` (committed = submitted/under review/approved WIRs for the item).
- Approving checks: `approved_qty ≤ submitted_qty` and `approved_qty ≤ contract_qty − already approved`.
- Separation of duties: the WIR engineer cannot review their own WIR (super admin exempt, audited).
- Returned/rejected decisions require a comment. Rejected WIRs are terminal.

### Daily reports
- One report per project per date.
- Project policy `manager`: submitted reports require PM approval; approver ≠ submitter.
- Project policy `none`: submission is final (no approval step exists).
- Activities linked to BOQ items apply their quantity to `executed_qty` at submission; rejection reverts it; resubmission applies only the delta (`dr_activities.applied_qty` prevents double counting).

### Inventory
- Documents (GRN / Issue / Transfer / Supplier Return) are `draft → posted`; posting writes immutable ledger rows inside one transaction; posted documents cannot be edited or deleted (corrections go through new documents).
- Issues/transfers/returns validate available stock; negative stock is only possible when the owning project explicitly enables `allowNegativeStock`.

### Stock adjustments
- **Simple** (project policy): authorized storekeeper records → posted immediately.
- **Controlled** (project policy): draft → submitted → approved → posted. Approver must hold an approval-capable role (PM/GM/accountant/owner/super admin) and cannot be the creator. Posting validates stock.

### Expenses
- `amount + tax = total` (computed with decimal math). Non-negative by schema + validation.
- Draft → submitted → approved/rejected; approver ≠ creator; only accountant/GM/owner/super admin roles can approve.

### BOQ variations
- Contract quantity changes are audited variations; quantity cannot be reduced below the already-approved quantity.

---

## Internationalization (Arabic / English)

- Full dictionaries in `src/server/i18n/en.ts` and `ar.ts`; every user-facing string is a key — no hardcoded UI text in components.
- Locale is persisted per user (`users.locale`) and in a `locale` cookie; the root layout sets `<html lang dir>` — Arabic renders `dir="rtl"`.
- The UI uses only logical CSS (Tailwind `ms-`/`me-`/`start-`/`end-`, `text-start`/`text-end`) so tables, forms, dialogs, dropdowns, toasts, timelines and print views mirror automatically in RTL.
- Language switcher: top-right button on the login page and in the app top bar, plus the user menu.
- Fonts are self-hosted (`src/app/fonts/` — Inter + Noto Kufi Arabic) via `next/font/local`, so builds need no network; Arabic gets a dedicated typeface in RTL mode, including print output.
- Numbers, dates and JOD amounts are formatted with `Intl` per locale (ar-JO / en-JO).

## Authorization

Role-based permission matrix in `src/server/auth/rbac.ts`. Every mutation is checked **server-side**; project records additionally require project membership (`project_members`) — super admin, owner, GM and auditor have global project access. The audit trail (`audit_logs`) is append-only and records actor, action, entity, before/after.

## Security

- bcryptjs password hashing (cost 12), JWT (jose) sessions with server-side session rows (revocable), httpOnly + SameSite=Lax + Secure cookies.
- CSRF: double-submit token required on all mutating requests.
- Login rate limiting (8 attempts / 15 min / email+IP, in-memory — swap for Redis on multi-instance).
- File uploads: size + MIME whitelist, checksummed, served through an authenticated endpoint that resolves project access from entity links.
- Secrets only via environment variables (see `.env.example`).

## Testing

```bash
npm run test          # vitest, needs TEST_DATABASE_URL (civil_erp_test)
npm run lint
npm run typecheck
npm run build
node tests/browser-audit.mjs   # Playwright: console errors + horizontal-overflow check
                               # across 320/375/430/768/1440px in EN and AR (needs running app)
```

62 tests cover: RBAC enforcement, WIR state machine & quantity integrity (no double counting, no over-approval, no over-submission), inventory posting & insufficient stock, ledger immutability (trigger-level), adjustment workflows under both policies, separation of duties, daily report policies & executed-quantity bookkeeping, expense approvals & totals, project isolation, and progress/value calculations.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | test database (used by vitest) |
| `AUTH_SECRET` | JWT signing secret (`openssl rand -base64 48`) |
| `STORAGE_PROVIDER` | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | local upload directory (default `./uploads`) |
| `S3_*` | S3-compatible object storage (interface present, SDK not wired — see `src/server/storage`) |

## Deployment (Render)

1. Create a **Web Service** from this repository (build: `npm run build`, start: `npm start`).
2. Create a **PostgreSQL** instance and set `DATABASE_URL` to its internal URL.
3. Set `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`.
4. Run `npm run db:migrate` and `npm run db:seed` once (Render shell or CI), or use the `render.yaml` blueprint in this repo.
5. Note: `STORAGE_PROVIDER=local` writes to the container filesystem (ephemeral). For durable storage set `STORAGE_PROVIDER=s3` after wiring an S3 SDK client in `src/server/storage/index.ts` (interface is ready) — or attach a Render disk and point `STORAGE_LOCAL_DIR` at it.

## Known limitations (honest)

- S3 storage provider interface exists but the SDK call is not implemented — `local` is the working provider.
- Login rate limiting is in-memory (fine for one instance; use Redis for scale-out).
- Notifications are out of scope; the dashboard derives pending work live from records.
- Currency display defaults to JOD; amounts are stored with their currency code but no multi-currency conversion is performed.
- Mobile/tablet layouts are responsive (breakpoints + mobile nav) but were not verified in a real browser/device; desktop is the primary verified surface.
