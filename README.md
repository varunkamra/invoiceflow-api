# InvoiceFlow API

[![CI](https://github.com/varunkamra/invoiceflow-api/actions/workflows/ci.yml/badge.svg)](https://github.com/varunkamra/invoiceflow-api/actions/workflows/ci.yml)

Multi-tenant invoicing SaaS backend — organizations manage customers and invoices, end-customers pay through a hosted payment link, payments sync back via signature-verified webhooks.

**Stack:** Fastify 5 · TypeScript · PostgreSQL (Prisma) · Redis + BullMQ · Razorpay · JWT auth · Docker

## Features

- **Multi-tenancy** — every resource scoped to an organization; JWTs carry `orgId` + role (`OWNER`/`ADMIN`/`VIEWER`), enforced at the route layer with `requireRole()`
- **Invoicing** — per-org invoice numbering (`INV-2026-0001`) safe under concurrency (row-lock transaction), line items, tax in basis points, status state machine (DRAFT → OPEN → PAID / VOID / UNCOLLECTIBLE)
- **Payments** — provider-abstracted: Razorpay payment links per invoice, idempotent webhook processing, refunds. A Stripe adapter is stubbed and drop-in ready (`src/services/payments/`)
- **Async jobs** — BullMQ workers in a separate process: PDF generation (pdfkit), invoice emails (Resend), dunning/overdue reminders with throttling and a daily sweep
- **Hardening** — rate limiting, helmet, timing-safe webhook signature verification on the raw body, idempotency via insert-first event table, audit log
- **Tests** — 15 integration tests (auth, invoicing math, state machine, cross-org isolation, webhook idempotency) running against a real Postgres
- **Docs** — OpenAPI at `/docs`
- **Fully containerized** — non-root image, healthcheck, migrations on boot, worker process

## Quick start (Docker, no local toolchain needed)

```bash
cp .env.example .env          # fill in Razorpay test keys (dashboard → settings → API keys)
docker compose up --build     # postgres + redis + api, migrations run on boot
# → http://localhost:3000/docs
```

## Development (hot reload)

```bash
npm install
npm run db:up                 # postgres + redis containers
npm run db:migrate            # prisma migrate dev
npm run db:seed               # demo org + data (login: demo@invoiceflow.dev / demo-password)
npm run dev                   # http://localhost:3000/docs
npm run worker                # separate process: BullMQ workers + daily overdue sweep
```

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Customers | CRUD under `/customers` |
| Invoices | CRUD under `/invoices`, `POST /invoices/:id/open`, `POST /invoices/:id/void`, `POST /invoices/:id/send`, `POST /invoices/:id/payment-link`, `POST /invoices/:id/mark-uncollectible` |
| Webhooks | `POST /webhooks/razorpay` (signature-verified, idempotent) |

## Notable engineering decisions

- **Invoice numbering under concurrency** — `SELECT … FOR UPDATE` on the org row inside the creation transaction; two simultaneous creates can't mint the same number, and the `@@unique` constraint is a backstop.
- **Webhook idempotency by insert-first** — the event id is the primary key; a duplicate event loses the race and no-ops. State changes happen in a transaction; failures are stored on the event row and surfaced as 500 so the provider retries.
- **Raw-body capture per-route** — signature verification needs the exact bytes the provider sent. The buffer parser is scoped to the webhook plugin's encapsulation context, so the rest of the API keeps the default JSON parser.
- **Secrets at call time** — the webhook secret is read when the request arrives, not at process start, so rotation doesn't require a restart.
- **Providers behind one interface** — `createPaymentLink` / `verifyAndParseWebhook` / `createRefund`; swapping Razorpay for Stripe is one line in `src/services/payments/index.ts`.

## Architecture

```
src/
├── config/       env validation (zod)
├── db/           prisma schema, migrations, seed
├── plugins/      fastify auth plugin (JWT → org context)
├── routes/       HTTP layer — validation, no business logic
├── services/     domain logic (invoices, customers, payments, email)
├── jobs/         BullMQ queues, workers, scheduler (separate process)
└── lib/          prisma client, error handler, pdf renderer
```

## Security

Secrets are never committed: `.env` is gitignored and dockerignored, and the deploy platform injects real keys at runtime. Test keys are placeholders until you add your own.
