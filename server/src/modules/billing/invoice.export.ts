import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { Tenant } from '../tenants/tenant.model.js';
import type { SubscriptionInvoice } from './billing.model.js';

function fontPath(): string | null {
  const candidates = [
    path.resolve('assets/fonts/Amiri-Regular.ttf'),
    path.resolve('server/assets/fonts/Amiri-Regular.ttf'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function renderInvoice(invoice: InstanceType<typeof SubscriptionInvoice>, format: 'pdf' | 'html'): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const tenant = await Tenant.findById(invoice.tenantId).select('businessName');
  const tenantName = tenant?.businessName ?? 'Tenant';
  const filename = `${invoice.invoiceNumber}.${format}`;
  if (format === 'html') {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title></head><body><h1>ENZO subscription invoice</h1><p>${tenantName}</p><p>${invoice.invoiceNumber}</p><p>Amount ${invoice.amount} ${invoice.currency}</p><p>Tax ${invoice.taxAmount}</p><p>Total ${invoice.totalAmount}</p><p>Status ${invoice.status}</p><p>Due ${invoice.dueDate}</p><p>This invoice is for the ENZO platform subscription. It is not a barbershop sale.</p></body></html>`;
    return { body: Buffer.from(html, 'utf8'), contentType: 'text/html; charset=utf-8', filename };
  }
  const body = await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    const font = fontPath();
    if (font) {
      document.font(font);
    }
    document.fontSize(18).text('ENZO subscription invoice');
    document.moveDown();
    document.fontSize(12);
    document.text(tenantName);
    document.text(invoice.invoiceNumber);
    document.text(`Amount ${invoice.amount} ${invoice.currency}`);
    document.text(`Tax ${invoice.taxAmount}`);
    document.text(`Total ${invoice.totalAmount}`);
    document.text(`Status ${invoice.status}`);
    document.text(`Due ${invoice.dueDate}`);
    document.moveDown();
    document.text('This invoice is for the ENZO platform subscription. It is not a barbershop sale.');
    document.end();
  });
  return { body, contentType: 'application/pdf', filename };
}
