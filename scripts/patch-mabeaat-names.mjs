import { readFileSync, writeFileSync } from 'fs';

const ssPath = 'g:/work space/Akram/client/src/app/features/appointments/shop-services.ts';
let ss = readFileSync(ssPath, 'utf8');
ss = ss.replaceAll('"en":"Extras","ar":"زيادات"', '"en":"Sales","ar":"مبيعات"');
ss = ss.replaceAll(
  /("id":"svc-ziadat-[^"]+"[\s\S]*?)"commissionType":"PERCENTAGE","commissionValue":0/g,
  '$1"commissionType":"FIXED","commissionValue":30',
);
writeFileSync(ssPath, ss);

const path = 'g:/work space/Akram/client/src/assets/shop.json';
const shop = JSON.parse(readFileSync(path, 'utf8'));
const name = { en: 'Sales', ar: 'مبيعات' };
for (const c of shop.serviceCategories) {
  if (c.id === 'cat-ziadat') {
    c.name = name;
    c.updatedAt = '2026-11-21T19:40:00.000Z';
  }
}
for (const s of shop.services) {
  if (s.categoryId === 'cat-ziadat' || String(s.id || '').startsWith('svc-ziadat-')) {
    s.categoryName = name;
    s.categoryId = 'cat-ziadat';
    s.commissionType = 'FIXED';
    s.commissionValue = 30;
    s.updatedAt = '2026-11-21T19:40:00.000Z';
  }
}
writeFileSync(path, JSON.stringify(shop, null, 2) + '\n');
console.log('updated shop + services');
