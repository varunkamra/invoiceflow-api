-- Rename Stripe-specific fields to provider-neutral names (Razorpay pivot)

ALTER TABLE "organizations" RENAME COLUMN "stripeCustomerId" TO "providerCustomerId";
ALTER TABLE "customers" RENAME COLUMN "stripeCustomerId" TO "providerCustomerId";
ALTER TABLE "invoices" RENAME COLUMN "stripeInvoiceId" TO "providerInvoiceId";
ALTER TABLE "invoices" RENAME COLUMN "stripePaymentIntentId" TO "providerPaymentId";
ALTER TABLE "invoices" RENAME COLUMN "stripeHostedUrl" TO "paymentUrl";
ALTER TABLE "payments" RENAME COLUMN "stripeChargeId" TO "providerPaymentId";
ALTER TABLE "payments" RENAME COLUMN "stripeRefundId" TO "refundId";

-- Drop the default before changing the enum value, then re-add
ALTER TABLE "payments" ALTER COLUMN "method" DROP DEFAULT;
ALTER TYPE "PaymentMethod" RENAME VALUE 'STRIPE' TO 'PROVIDER';
ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'PROVIDER';
