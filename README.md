# TaleemOS Pakistan

Multi-tenant education management SaaS. See `DEVELOPMENT_STATUS.md` for exactly what works today (early stage).

## Requirements
Node 22+, PostgreSQL 16 (or Docker).

## Setup
```bash
npm install
cp .env.example .env     # set DATABASE_URL, SESSION_SECRET, and TEST_DATABASE_URL (a DB whose name ends in _test)
# optional local DB:  POSTGRES_PASSWORD=choose-one docker compose up -d db
npm run db:migrate       # applies drizzle/*.sql
BOOTSTRAP_SUPERADMIN_EMAIL=you@example.com BOOTSTRAP_SUPERADMIN_PASSWORD='a-long-passphrase' npm run bootstrap:superadmin
npm run dev              # http://localhost:3000/login
```
The bootstrap command works once; it refuses to run if a platform user already exists. Remove the password from your environment afterwards.

## Commands
`npm run typecheck` · `npm test` (needs the `_test` database migrated: `DATABASE_URL=<test url> npm run db:migrate`) · `npm run build` · `npm run db:generate` (after editing `src/db/schema.ts`)

## Security notes
Never commit `.env`. Passwords are argon2id hashes and can never be retrieved; sessions are random tokens stored only as hashes. Integration tests refuse to run unless the database name ends in `_test`.
