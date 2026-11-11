import { existsSync } from 'node:fs';
import path from 'node:path';
import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportPayload } from './report.service.js';

const TITLES: Record<string, { en: string; ar: string }> = {
  dashboard: { en: 'Sales dashboard', ar: 'لوحة المبيعات' },
  daily: { en: 'Daily sales', ar: 'المبيعات اليومية' },
  weekly: { en: 'Weekly sales', ar: 'المبيعات الأسبوعية' },
  monthly: { en: 'Monthly sales', ar: 'المبيعات الشهرية' },
  branches: { en: 'Sales by branch', ar: 'المبيعات حسب الفرع' },
  employees: { en: 'Sales by employee', ar: 'المبيعات حسب الموظف' },
  services: { en: 'Sales by service', ar: 'المبيعات حسب الخدمة' },
  products: { en: 'Sales by product', ar: 'المبيعات حسب المنتج' },
  categories: { en: 'Sales by category', ar: 'المبيعات حسب الفئة' },
  payments: { en: 'Sales by payment method', ar: 'المبيعات حسب طريقة الدفع' },
  discounts: { en: 'Discounts', ar: 'الخصومات' },
  refunds: { en: 'Refunds', ar: 'المرتجعات' },
  transactions: { en: 'Transactions', ar: 'العمليات' },
  performance: { en: 'Employee performance', ar: 'أداء الموظفين' },
  customers: { en: 'Customers', ar: 'العملاء' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  attendance: { en: 'Attendance', ar: 'الحضور' },
  payroll: { en: 'Payroll', ar: 'الرواتب' },
  cashier: { en: 'Cashier shifts', ar: 'ورديات الصندوق' },
  suppliers: { en: 'Supplier payments', ar: 'مدفوعات الموردين' },
};

const COLUMNS: Record<string, { en: string; ar: string }> = {
  period: { en: 'Period', ar: 'الفترة' },
  label: { en: 'Name', ar: 'الاسم' },
  gross: { en: 'Gross sales', ar: 'إجمالي المبيعات' },
  discounts: { en: 'Discounts', ar: 'الخصومات' },
  refunds: { en: 'Refunds', ar: 'المرتجعات' },
  net: { en: 'Net sales', ar: 'صافي المبيعات' },
  tips: { en: 'Tips', ar: 'البقشيش' },
  transactions: { en: 'Transactions', ar: 'العمليات' },
  method: { en: 'Method', ar: 'الطريقة' },
  transaction: { en: 'Transaction', ar: 'العملية' },
  customer: { en: 'Customer', ar: 'العميل' },
  status: { en: 'Status', ar: 'الحالة' },
  amount: { en: 'Amount', ar: 'المبلغ' },
  sku: { en: 'SKU', ar: 'الرمز' },
  quantity: { en: 'Quantity', ar: 'الكمية' },
  visits: { en: 'Visits', ar: 'الزيارات' },
  average: { en: 'Average', ar: 'المتوسط' },
  commission: { en: 'Commission', ar: 'العمولة' },
  services: { en: 'Services', ar: 'الخدمات' },
  completedAppointments: { en: 'Completed appointments', ar: 'المواعيد المكتملة' },
  late: { en: 'Late arrivals', ar: 'التأخير' },
  absences: { en: 'Absences', ar: 'الغياب' },
  approvedLeave: { en: 'Approved leave', ar: 'الإجازة المعتمدة' },
  payrollPaid: { en: 'Paid payroll', ar: 'راتب مدفوع' },
  purchased: { en: 'Purchased', ar: 'المشترى' },
  used: { en: 'Used', ar: 'المستخدم' },
  remaining: { en: 'Remaining', ar: 'المتبقي' },
  price: { en: 'Price', ar: 'السعر' },
  onHand: { en: 'On hand', ar: 'الرصيد' },
  minimum: { en: 'Minimum', ar: 'الحد الأدنى' },
  averageCost: { en: 'Average cost', ar: 'متوسط التكلفة' },
  value: { en: 'Value', ar: 'القيمة' },
  type: { en: 'Type', ar: 'النوع' },
  unitCost: { en: 'Unit cost', ar: 'تكلفة الوحدة' },
  number: { en: 'Number', ar: 'الرقم' },
  supplier: { en: 'Supplier', ar: 'المورد' },
  total: { en: 'Total', ar: 'الإجمالي' },
  paid: { en: 'Paid', ar: 'المدفوع' },
  paymentStatus: { en: 'Payment status', ar: 'حالة الدفع' },
  lines: { en: 'Lines', ar: 'البنود' },
  date: { en: 'Date', ar: 'التاريخ' },
  employee: { en: 'Employee', ar: 'الموظف' },
  lateMinutes: { en: 'Late minutes', ar: 'دقائق التأخير' },
  earlyMinutes: { en: 'Early minutes', ar: 'دقائق الخروج المبكر' },
  present: { en: 'Present', ar: 'حاضر' },
  absent: { en: 'Absent', ar: 'غائب' },
  early: { en: 'Early departure', ar: 'خروج مبكر' },
  leaveType: { en: 'Leave type', ar: 'نوع الإجازة' },
  entitled: { en: 'Entitled', ar: 'المستحق' },
  pending: { en: 'Pending', ar: 'المعلق' },
  start: { en: 'Start', ar: 'البداية' },
  end: { en: 'End', ar: 'النهاية' },
  days: { en: 'Days', ar: 'الأيام' },
  periodStart: { en: 'Period', ar: 'الفترة' },
  basic: { en: 'Basic salary', ar: 'الراتب الأساسي' },
  allowances: { en: 'Allowances', ar: 'البدلات' },
  deductions: { en: 'Deductions', ar: 'الاستقطاعات' },
  correction: { en: 'Correction', ar: 'تصحيح' },
  component: { en: 'Component', ar: 'البند' },
  opening: { en: 'Opening cash', ar: 'الرصيد الافتتاحي' },
  cashSales: { en: 'Cash sales', ar: 'مبيعات نقدية' },
  cashTips: { en: 'Cash tips', ar: 'بقشيش نقدي' },
  cashRefunds: { en: 'Cash refunds', ar: 'مرتجعات نقدية' },
  expectedCash: { en: 'Expected cash', ar: 'النقد المتوقع' },
  formulaExpected: { en: 'Formula expected', ar: 'المتوقع بالمعادلة' },
  actualCash: { en: 'Actual cash', ar: 'النقد الفعلي' },
  difference: { en: 'Difference', ar: 'الفرق' },
  purchase: { en: 'Purchase', ar: 'المشتريات' },
};

const FORMS: Record<string, [number, number | null, number | null, number | null]> = {
  '\u0621': [0xfe80, null, null, null],
  '\u0622': [0xfe81, 0xfe82, null, null],
  '\u0623': [0xfe83, 0xfe84, null, null],
  '\u0624': [0xfe85, 0xfe86, null, null],
  '\u0625': [0xfe87, 0xfe88, null, null],
  '\u0626': [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  '\u0627': [0xfe8d, 0xfe8e, null, null],
  '\u0628': [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  '\u0629': [0xfe93, 0xfe94, null, null],
  '\u062a': [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  '\u062b': [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  '\u062c': [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  '\u062d': [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  '\u062e': [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  '\u062f': [0xfea9, 0xfeaa, null, null],
  '\u0630': [0xfeab, 0xfeac, null, null],
  '\u0631': [0xfead, 0xfeae, null, null],
  '\u0632': [0xfeaf, 0xfeb0, null, null],
  '\u0633': [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  '\u0634': [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  '\u0635': [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  '\u0636': [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  '\u0637': [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  '\u0638': [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  '\u0639': [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  '\u063a': [0xfecd, 0xfece, 0xfecf, 0xfed0],
  '\u0641': [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  '\u0642': [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  '\u0643': [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  '\u0644': [0xfedd, 0xfede, 0xfedf, 0xfee0],
  '\u0645': [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  '\u0646': [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  '\u0647': [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  '\u0648': [0xfeed, 0xfeee, null, null],
  '\u0649': [0xfeef, 0xfef0, null, null],
  '\u064a': [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};

function connectsForward(char: string): boolean {
  return FORMS[char]?.[2] != null;
}

function isArabicChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x0621 && code <= 0x064a) || (code >= 0xfe70 && code <= 0xfeff);
}

/** Presentation forms for PDF viewers that do not shape Arabic themselves. */
export function shapeArabic(text: string): string {
  if (!/[\u0600-\u06FF]/.test(text)) {
    return text;
  }
  const chars = [...text];
  const shaped = chars.map((char, index) => {
    const forms = FORMS[char];
    if (!forms) {
      return char;
    }
    const previous = chars[index - 1] ?? '';
    const next = chars[index + 1] ?? '';
    const before = connectsForward(previous);
    const after = connectsForward(char) && isArabicChar(next);
    const chosen = before && after ? forms[3] : before ? forms[1] : after ? forms[2] : forms[0];
    return String.fromCharCode(chosen ?? forms[0]);
  });
  return [...shaped.join('')].reverse().join('');
}

function text(key: string, lang: string, group: 'title' | 'column' = 'column'): string {
  const entry = (group === 'title' ? TITLES : COLUMNS)[key];
  if (!entry) {
    return key;
  }
  return lang === 'ar' ? entry.ar : entry.en;
}

function cell(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function fontPath(): string | null {
  const candidates = [
    path.resolve('assets/fonts/Amiri-Regular.ttf'),
    path.resolve('server/assets/fonts/Amiri-Regular.ttf'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function reportTitle(kind: string, lang: string): string {
  return text(kind, lang, 'title');
}

export async function renderReport(report: ReportPayload, format: 'csv' | 'xlsx' | 'pdf' | 'html', lang: string): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const title = reportTitle(report.kind, lang);
  const headers = report.columns.map((column) => text(column, lang, 'column'));
  const filename = `enzo-${report.kind}-${report.filters['from']}.${format === 'html' ? 'html' : format}`;
  const preamble = [report.tenantName, report.branchName, title, report.generatedAt, report.currency];
  if (format === 'csv') {
    const lines = [
      ...preamble.map((line) => csvCell(line)),
      '',
      headers.map(csvCell).join(','),
      ...report.rows.map((row) => report.columns.map((column) => csvCell(cell(row[column]))).join(',')),
    ];
    return { body: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'), contentType: 'text/csv; charset=utf-8', filename };
  }
  if (format === 'xlsx') {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Report');
    for (const line of preamble) {
      sheet.addRow([line]);
    }
    sheet.addRow([]);
    sheet.addRow(headers);
    for (const row of report.rows) {
      sheet.addRow(report.columns.map((column) => row[column] ?? ''));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      body: Buffer.from(buffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }
  if (format === 'html') {
    const direction = lang === 'ar' ? 'rtl' : 'ltr';
    const head = preamble.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    const tableHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const tableBody = report.rows
      .map((row) => `<tr>${report.columns.map((column) => `<td>${escapeHtml(cell(row[column]))}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!doctype html><html lang="${lang}" dir="${direction}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Amiri,Tahoma,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:start}@media print{button{display:none}}</style></head><body><button onclick="print()">${lang === 'ar' ? 'طباعة' : 'Print'}</button>${head}<table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table></body></html>`;
    return { body: Buffer.from(html, 'utf8'), contentType: 'text/html; charset=utf-8', filename };
  }
  const font = fontPath();
  const body = await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    if (font) {
      document.font(font);
    }
    const write = (value: string) => document.text(lang === 'ar' ? shapeArabic(value) : value, { align: lang === 'ar' ? 'right' : 'left' });
    for (const line of preamble) {
      write(line);
    }
    document.moveDown();
    write(headers.join(' | '));
    for (const row of report.rows.slice(0, 40)) {
      write(report.columns.map((column) => cell(row[column])).join(' | '));
    }
    if (report.rows.length > 40) {
      write(lang === 'ar' ? 'تم اختصار الصفوف في ملف PDF. استخدم Excel للقائمة الكاملة.' : 'PDF rows are shortened. Use Excel for the full list.');
    }
    document.end();
  });
  return { body, contentType: 'application/pdf', filename };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
