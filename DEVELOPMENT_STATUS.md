# TaleemOS Pakistan: Development Status

Last updated: 2026-11-02. Honest status; nothing below is claimed beyond what was actually run.

## Current stage
Stages 1-3 complete, Stage 4 (Super Admin) partially complete. The product is early: only the vertical slice below exists.

## Decisions made
- **Drizzle ORM instead of Prisma.** The spec asks for Prisma, but the Prisma CLI downloads its engine from `binaries.prisma.sh`, which the development sandbox's network policy blocks (HTTP 403), so it could not validate, generate or migrate. I did not bypass that block. Drizzle installs entirely from npm, generates plain SQL migrations (`drizzle/0000_init.sql`), and keeps PostgreSQL, foreign keys, constraints and versioned migrations. If you prefer Prisma, the schema in `src/db/schema.ts` maps 1:1 and can be ported on a machine with normal network access.
- Institute users sign in with an **institute code** (slug) + email; platform operators leave it empty. This keeps emails unique per institute.
- Institute owners are created with a one-time temporary password that must be changed at first sign-in. **No email is sent** (no provider configured), and the UI says so.
- Roles are fixed role keys in code (`src/lib/rbac.ts`) stored in `user_roles`, not yet editable per institute.

## Verified (actually run)
| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict + `noUncheckedIndexedAccess`) | clean |
| `npx vitest run` | 6 files, 55 tests passed (unit + integration against a real PostgreSQL test DB `taleemos_test`) |
| `npx next build` | succeeded (routes: /, /login, /change-password, /admin, /app, 4 API routes) |
| End-to-end HTTP smoke test (dev server + curl, test DB) | 23/23 checks matched expectations; no password found in DB, audit log or server log |
| `drizzle-kit migrate` on dev and test DBs | applied; 22 tables, CHECK + partial unique indexes present |

## Implemented
- **Auth:** argon2id hashing; random session tokens stored only as SHA-256 hashes; HttpOnly SameSite=Lax cookie plus Origin check on every state-changing route; 5-failure lockout (15 min); generic login errors with timing equalisation; security events; session revocation (logout, password change, suspended institute); forced password change; one-time Super Admin bootstrap that refuses to run if a platform user exists.
- **Tenant isolation:** `openTenant()` derives the institution from the authenticated actor, rejects (and logs) cross-tenant requests, filters every query by institution, enforces permissions and the subscription guard on the server.
- **Onboarding:** `registerInstitution` creates institution + owner + 14-day trial + audit entry in one transaction (rollback verified on duplicates); Pakistani phone validation.
- **Subscription enforcement:** expiry, grace period and suspension enforced in the backend guard (tested).
- **Pages:** landing, sign-in, change password, Super Admin dashboard (real counts, recent institutes, register form), minimal institute workspace (real student list).
- **Pure logic with tests:** RBAC, subscription lifecycle, grading, exact money, Smart Gate scan rules, fee payment allocation.
- Student create/list/get (tenant-scoped, audited, duplicate admission numbers per institute rejected).

## Known issues / limitations
- `npm audit`: 4 moderate advisories, all from esbuild inside `drizzle-kit` (dev tool: an esbuild *dev-server* issue; not run, not shipped). The npm "fix" downgrades drizzle-kit to 0.18.1, so it was not applied.
- No IP-based rate limiting yet (only per-account lockout). No CAPTCHA. No email verification or password-reset-by-link yet.
- PostgreSQL Row-Level Security not yet added (isolation is enforced in application code and tested).
- Student operations are only exposed through server code (no API routes or UI for creating students yet).
- Dashboard shows no revenue figures: payment recording is not built.
- ESLint not configured (`next lint` was removed in Next 16).
- Local Postgres in this sandbox stops between sessions; restart with `service postgresql start`.

## Not started
Super Admin: plan management, payment recording + receipts, renewals, account-recovery tools (reset link, session revocation UI), institute edit/suspend UI, audit/security log views, reports. Institute: admissions, student UI, parents, teachers/staff, classes/sections/sessions UI, timetable, attendance UI, Smart Gate API/scanner UI + QR cards, fees/invoices, expenses, exams/results, homework, library, transport, inventory, leave, payroll, certificates, notifications, portals, Urdu/RTL, Excel/PDF exports, Playwright e2e, CI, Dockerfile, ARCHITECTURE/DATABASE/SECURITY/DEPLOYMENT docs.

## Acceptance tests (spec section 27: 25 total)
Done and automated: #1 (Super Admin sign-in), #2 (register institute), #3 (owner accesses own institute), #4 (A cannot reach B), #5 (role denial), #6 (trial plan assigned at onboarding; paid plan assignment not built), #8 (expiry calc), #9 (expired subscriptions blocked by backend), #11 (hashes only, no retrieval), #12 and #13 (student save/retrieve and duplicates, at service level), #15/#16 (scan duplicate/revoked handling, rules only, not wired to DB), #19-#20 partially (allocation and grading logic only), #21 (permission logic only).
Not done: #7, #10, #14, #17, #18, #22-#25.

## Exact next step
Build Super Admin subscription management: plan CRUD, payment recording (append-only, idempotent) with receipt numbers, renewal that extends from the current expiry, plus the recovery tools (reset link, revoke sessions), each with integration tests.
