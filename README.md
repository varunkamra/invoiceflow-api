# InvoiceFlow API

Multi-tenant invoicing SaaS backend — organizations manage customers and invoices, end-customers pay through Stripe, payments sync back via webhooks.

**Stack:** Fastify 5 · TypeScript · PostgreSQL (Prisma) · Redis + BullMQ · Stripe · JWT auth

## Features

- **Multi-tenancy** — every resource scoped to an organization; JWTs carry `orgId` + role (`OWNER`/`ADMIN`/`VIEWER`)
- **Invoicing** — per-org invoice numbering (`INV-2026-0001`), line items, tax, status state machine (DRAFT → OPEN → PAID / VOID / UNCOLLECTIBLE)
- **Payments** — Stripe Checkout links per invoice, idempotent webhook processing (`checkout.session.completed`, `charge.refunded`, …), refunds
- **Async jobs** — BullMQ workers for PDF generation (pdfkit), invoice emails (Resend), dunning/overdue reminders
- **Hardening** — rate limiting, helmet, webhook signature verification, DB transaction for checkout concurrency, audit log
- **Docs** — OpenAPI at `/docs`

## Quick start

```bash
cp .env.example .env          # fill in Stripe test keys
npm install
npm run db:up                 # postgres + redis via docker compose
npm run db:migrate            # prisma migrate dev
npm run db:seed               # demo org + data
npm run dev                   # http://localhost:3000/docs
```

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Org | `GET/PATCH /org`, `POST /org/checkout` (upgrade to PRO via Stripe subscription) |
| Customers | CRUD under `/customers` |
| Invoices | CRUD under `/invoices`, `POST /invoices/:id/send`, `POST /invoices/:id/payment-link`, `POST /invoices/:id/void` |
| Payments | `GET /invoices/:id/payments`, `POST /payments/:id/refund` |
| Webhooks | `POST /webhooks/stripe` (signature-verified, idempotent) |

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
