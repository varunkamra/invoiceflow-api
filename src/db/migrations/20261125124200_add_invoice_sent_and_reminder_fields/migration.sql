-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);
