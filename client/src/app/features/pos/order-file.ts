export interface SavedOrderLine {
  service: string;
  quantity: number;
  price: number;
}

export interface SavedOrder {
  savedAt: string;
  customer: string;
  phone: string;
  barber: string;
  branch: string;
  discount: number;
  total: number;
  cash: number;
  amountDue: number;
  services: SavedOrderLine[];
  payments: Array<{ method: string; amount: number; referenceNumber: string }>;
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function cell(value: string): string {
  const numeric = value !== '' && /^-?\d+(\.\d+)?$/.test(value);
  const type = numeric ? 'Number' : 'String';
  const text = numeric ? value : xml(value);
  return `<Cell><Data ss:Type="${type}">${text}</Data></Cell>`;
}

/** Downloads the order as JSON and as an Excel sheet. */
export function saveOrderFiles(order: SavedOrder): void {
  const stamp = order.savedAt.replaceAll(':', '-').replaceAll('.', '-');
  download(`enzo-order-${stamp}.json`, new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' }));
  const header = ['Saved at', 'Customer', 'Phone', 'Barber', 'Branch', 'Service', 'Quantity', 'Price', 'Discount', 'Amount due', 'Payment method', 'Payment amount', 'Reference'];
  const lines = order.services.length > 0 ? order.services : [{ service: '', quantity: 0, price: 0 }];
  const rowCount = Math.max(lines.length, order.payments.length, 1);
  const rows = [header];
  for (let index = 0; index < rowCount; index += 1) {
    const line = lines[index];
    const payment = order.payments[index];
    rows.push([
      index === 0 ? order.savedAt : '',
      index === 0 ? order.customer : '',
      index === 0 ? order.phone : '',
      index === 0 ? order.barber : '',
      index === 0 ? order.branch : '',
      line?.service ?? '',
      line ? String(line.quantity) : '',
      line ? String(line.price) : '',
      index === 0 ? String(order.discount) : '',
      index === 0 ? String(order.amountDue) : '',
      payment?.method ?? '',
      payment ? String(payment.amount) : '',
      payment?.referenceNumber ?? '',
    ]);
  }
  const table = rows.map((row) => `<Row>${row.map((value) => cell(value)).join('')}</Row>`).join('');
  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Order"><Table>${table}</Table></Worksheet>
</Workbook>`;
  window.setTimeout(() => {
    download(`enzo-order-${stamp}.xls`, new Blob([workbook], { type: 'application/vnd.ms-excel' }));
  }, 300);
}
