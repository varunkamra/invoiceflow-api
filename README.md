# InvoiceFlow API

Multi-tenant invoicing SaaS backend — organizations manage customers and invoices, end-customers pay through a hosted payment link, payments sync back via webhooks.

**Stack:** Fastify 5 · TypeScript · PostgreSQL (Prisma) · Redis + BullMQ · Razorpay · JWT auth · Docker

## Features

- **Multi-tenancy** — every resource scoped to an organization; JWTs carry `orgId` + role (`OWNER`/`ADMIN`/`VIEWER`)
- **Invoicing** — per-org invoice numbering (`INV-2026-0001`), line items, tax, status state machine (DRAFT → OPEN → PAID / VOID / UNCOLLECTIBLE)
- **Payments** — provider-abstracted: Razorpay payment links per invoice, idempotent signature-verified webhook processing, refunds. A Stripe adapter is stubbed and drop-in ready (`src/services/payments/`)
- **Async jobs** — BullMQ workers for PDF generation (pdfkit), invoice emails (Resend), dunning/overdue reminders
- **Hardening** — rate limiting, helmet, webhook signature verification (timing-safe), raw-body capture for signature checks, DB transaction for invoice-number concurrency, audit log
- **Docs** — OpenAPI at `/docs`
- **Fully containerized** — non-root image, healthcheck, migrations on boot

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
npm run dev                   # http://localhost:3000/docs
```


## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Org | `GET/PATCH /org`, `POST /org/checkout` (upgrade to PRO via Stripe subscription) |
| Customers | CRUD under `/customers` |
| Invoices | CRUD under `/invoices`, `POST /invoices/:id/open`, `POST /invoices/:id/void`, `POST /invoices/:id/payment-link` |
| Webhooks | `POST /webhooks/razorpay` (signature-verified, idempotent) |

## Architecture

```
src/
├── config/       env validation (zod)
├── db/           prisma schema + seed
├── plugins/      fastify auth plugin (JWT → org context)
├── routes/       HTTP layer — validation, no business logic
├── services/     domain logic (stripe, invoices, emails)
├── jobs/         BullMQ queues, workers, scheduler
└── lib/          prisma client, error handler, pdf
```
