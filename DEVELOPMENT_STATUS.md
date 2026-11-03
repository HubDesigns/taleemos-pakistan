# TaleemOS Pakistan: Development Status

Last updated: 2026-11-02. Honest status; nothing below is claimed beyond what was actually run.

## Current stage
Stages 1-3 complete. Stage 4 (Super Admin) and Stage 5 (billing) partially complete: billing works end to end in the browser (plans, record/verify/reject payments, receipts, revenue on the dashboard). Remaining Super Admin work is listed below. The product is early: only the vertical slice below exists.

## Decisions made
- **Drizzle ORM instead of Prisma.** The spec asks for Prisma, but the Prisma CLI downloads its engine from `binaries.prisma.sh`, which the development sandbox's network policy blocks (HTTP 403), so it could not validate, generate or migrate. I did not bypass that block. Drizzle installs entirely from npm, generates plain SQL migrations (`drizzle/0000_init.sql`), and keeps PostgreSQL, foreign keys, constraints and versioned migrations. If you prefer Prisma, the schema in `src/db/schema.ts` maps 1:1 and can be ported on a machine with normal network access.
- Institute users sign in with an **institute code** (slug) + email; platform operators leave it empty. This keeps emails unique per institute.
- Institute owners are created with a one-time temporary password that must be changed at first sign-in. **No email is sent** (no provider configured), and the UI says so.
- Roles are fixed role keys in code (`src/lib/rbac.ts`) stored in `user_roles`, not yet editable per institute.

## Verified (actually run)
| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict + `noUncheckedIndexedAccess`) | clean |
| `npx vitest run` | 7 files, 70 tests passed (unit + integration against a real PostgreSQL test DB `taleemos_test`) |
| `npx next build` | succeeded (17 routes incl. /admin/billing, /admin/receipts/[id], billing API routes) |
| End-to-end HTTP smoke tests (dev server + curl, test DB) | auth/onboarding: 23/23 matched. Billing: 35/35 matched (CSRF, 401/403, idempotent retry, pending does not extend access, verify/receipt, double-verify refused, reject flow, owner blocked from all billing actions). No password or transaction reference found in audit log or server log. The billing run caught a real bug (bad amount returned 500); fixed and covered by a test. |
| `drizzle-kit migrate` on dev and test DBs | applied; 22 tables, CHECK + partial unique indexes present |

## Implemented
- **Auth:** argon2id hashing; random session tokens stored only as SHA-256 hashes; HttpOnly SameSite=Lax cookie plus Origin check on every state-changing route; 5-failure lockout (15 min); generic login errors with timing equalisation; security events; session revocation (logout, password change, suspended institute); forced password change; one-time Super Admin bootstrap that refuses to run if a platform user exists.
- **Tenant isolation:** `openTenant()` derives the institution from the authenticated actor, rejects (and logs) cross-tenant requests, filters every query by institution, enforces permissions and the subscription guard on the server.
- **Onboarding:** `registerInstitution` creates institution + owner + 14-day trial + audit entry in one transaction (rollback verified on duplicates); Pakistani phone validation.
- **Subscription enforcement:** expiry, grace period and suspension enforced in the backend guard (tested).
- **Pages:** landing, sign-in, change password, Super Admin dashboard (real counts, recent institutes, register form), minimal institute workspace (real student list).
- **Pure logic with tests:** RBAC, subscription lifecycle, grading, exact money, Smart Gate scan rules, fee payment allocation.
- Student create/list/get (tenant-scoped, audited, duplicate admission numbers per institute rejected).

## Billing (service layer: `src/server/billing.ts`, tests in `tests/billing.test.ts`)
- Plans: create with validated exact-decimal price; custom/trial plans require a duration; duplicate codes rejected.
- `recordPayment`: stores a **PENDING** payment only. It never extends access, because a typed-in reference is not proof of payment. Idempotent (same `idempotencyKey` returns the original), rejects bad amounts, inactive plans and reused transaction references.
- `verifyPayment`: in one transaction, marks VERIFIED, extends the subscription from the later of (current expiry, now), switches the plan, and issues receipt `TOS-<year>-<6 digits>`. Concurrent double-verify is safe (tested): exactly one succeeds.
- `rejectPayment` (reason required): no extension, no receipt, cannot be verified later.
- A manually SUSPENDED or CANCELLED subscription stays so after payment; paid time is still added.
- Every payment stays in history; nothing is overwritten. Verification policy: the same Super Admin may record and verify (only one operator exists today); add a second-person rule if you want separation of duties.
- **Screens and routes:** `/admin/billing` (payments table with Verify/Reject, record-payment form with a per-attempt idempotency key, plans list and create form), `/admin/receipts/[id]` (printable receipt; use the browser's Print > Save as PDF), `POST /api/admin/plans`, `/api/admin/payments`, `/api/admin/payments/[id]/verify|reject`. All routes check the Origin header, require a session (401) and a billing permission (403). Trial plans cannot be purchased.
- **Dashboard revenue:** verified revenue, pending count/amount, MRR and ARR. MRR/ARR are *estimates* from plan list prices of paid, unexpired subscriptions.
- Not yet built: server-generated receipt PDF file, payment gateway integration, renewal reminders and the scheduled expiry check, editing/deactivating plans from the UI, a billing view per institute, charts (revenue trends).

## Known issues / limitations
- `npm audit`: 4 moderate advisories, all from esbuild inside `drizzle-kit` (dev tool: an esbuild *dev-server* issue; not run, not shipped). The npm "fix" downgrades drizzle-kit to 0.18.1, so it was not applied.
- No IP-based rate limiting yet (only per-account lockout). No CAPTCHA. No email verification or password-reset-by-link yet.
- PostgreSQL Row-Level Security not yet added (isolation is enforced in application code and tested).
- Student operations are only exposed through server code (no API routes or UI for creating students yet).
- Dashboard shows no revenue figures: payment recording is not built.
- ESLint not configured (`next lint` was removed in Next 16).
- Local Postgres in this sandbox stops between sessions; restart with `service postgresql start`.

## Not started
Super Admin: institute detail/edit/suspend/restore screens, account-recovery tools, audit and security log views, reports (reset link, session revocation UI), institute edit/suspend UI, audit/security log views, reports. Institute: admissions, student UI, parents, teachers/staff, classes/sections/sessions UI, timetable, attendance UI, Smart Gate API/scanner UI + QR cards, fees/invoices, expenses, exams/results, homework, library, transport, inventory, leave, payroll, certificates, notifications, portals, Urdu/RTL, Excel/PDF exports, Playwright e2e, CI, Dockerfile, ARCHITECTURE/DATABASE/SECURITY/DEPLOYMENT docs.

## Acceptance tests (spec section 27: 25 total)
Done and automated: #1 (Super Admin sign-in), #2 (register institute), #3 (owner accesses own institute), #4 (A cannot reach B), #5 (role denial), #6 (trial plan assigned at onboarding; paid plan assignment not built), #8 (expiry calc), #9 (expired subscriptions blocked by backend), #11 (hashes only, no retrieval), #12 and #13 (student save/retrieve and duplicates, at service level), #15/#16 (scan duplicate/revoked handling, rules only, not wired to DB), #19-#20 partially (allocation and grading logic only), #21 (permission logic only).
#6 (assign a paid plan) and #7 (payments recorded without overwriting history) are covered by tests and the live check; #9 expiry enforcement is also exercised through the live app. Not done: #10, #14, #17, #18, #22-#25.

## Exact next step
Institute management for the Super Admin: institute detail page (subscription, payment history, last login), edit, suspend/restore (sessions must stop immediately, already enforced in the backend), then the account-recovery tools (one-time reset link, revoke sessions, disable account) with audit entries.
