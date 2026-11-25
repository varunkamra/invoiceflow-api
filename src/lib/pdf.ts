import PDFDocument from "pdfkit";

/**
 * Render an invoice PDF. Returns a Buffer.
 *
 * Amounts are stored in minor units (cents) and formatted for display here.
 * currency is a 3-letter ISO code; minor-unit divisor is 100 for the
 * currencies we support (usd, eur, gbp, inr — all 2-decimal in practice).
 */
export interface InvoicePdfData {
  number: string;
  status: string;
  dueDate: Date;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes?: string | null;
  organizationName: string;
  customer: { name: string; email: string };
  items: { description: string; quantity: number; unitPriceCents: number; totalCents: number }[];
}

export function renderInvoicePdf(invoice: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmt = (cents: number) =>
      `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency.toUpperCase()}`;

    // Header
    doc.fontSize(24).text("INVOICE", { align: "right" });
    doc.fontSize(10).text(invoice.number, { align: "right" });
    doc.moveDown();

    // Parties
    doc.font("Helvetica-Bold").fontSize(12).text(invoice.organizationName);
    doc.font("Helvetica").fontSize(10).text("Billed to:");
    doc.font("Helvetica-Bold").fontSize(12).text(invoice.customer.name);
    doc.font("Helvetica").fontSize(10).text(invoice.customer.email);
    doc.font("Helvetica-Bold").fontSize(12).text(invoice.organizationName);
    doc.font("Helvetica").fontSize(10).text("Billed to:");
    doc.font("Helvetica-Bold").fontSize(12).text(invoice.customer.name);
    doc.font("Helvetica").fontSize(10).text(invoice.customer.email);
    doc.moveDown();

    doc.fontSize(10).text(`Due: ${invoice.dueDate.toISOString().slice(0, 10)}`);
    doc.moveDown();

    // Items table
    const tableTop = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Description", 50, tableTop);
    doc.text("Qty", 350, tableTop, { width: 50, align: "right" });
    doc.text("Unit price", 400, tableTop, { width: 90, align: "right" });
    doc.text("Amount", 490, tableTop, { width: 55, align: "right" });
    doc.font("Helvetica").moveDown(0.5);

    let y = doc.y + 5;
    for (const item of invoice.items) {
      doc.text(item.description, 50, y, { width: 290 });
      doc.text(String(item.quantity), 350, y, { width: 50, align: "right" });
      doc.text(fmt(item.unitPriceCents), 400, y, { width: 90, align: "right" });
      doc.text(fmt(item.totalCents), 490, y, { width: 55, align: "right" });
      y += 20;
    }
    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke();
    y += 16;

    doc.font("Helvetica-Bold");
    doc.text("Subtotal", 400, y, { width: 90, align: "right" });
    doc.text(fmt(invoice.subtotalCents), 490, y, { width: 55, align: "right" });
    y += 18;
    doc.text("Tax", 400, y, { width: 90, align: "right" });
    doc.text(fmt(invoice.taxCents), 490, y, { width: 55, align: "right" });
    y += 18;
    doc.fontSize(12);
    doc.text("Total", 400, y, { width: 90, align: "right" });
    doc.text(fmt(invoice.totalCents), 490, y, { width: 55, align: "right" });

    if (invoice.notes) {
      doc.moveDown(2).font("Helvetica").fontSize(9).text(`Notes: ${invoice.notes}`);
    }

    doc.end();
  });
}
