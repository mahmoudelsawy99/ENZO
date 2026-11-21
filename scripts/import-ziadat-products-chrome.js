/**
 * Paste into Chrome Console on http://localhost:8080
 * Adds زيادات POS tab products. Does NOT delete existing sales/customers.
 * POS shows sell price only; costPrice is stored in DB.
 */
(async () => {
  const now = new Date().toISOString();
  const CAT = { id: 'cat-ziadat', name: { en: 'Sales', ar: 'مبيعات' } };
  const PCAT = { id: 'pcat-ziadat', name: { en: 'Sales', ar: 'مبيعات' } };
  const ITEMS = [
    { id: 'ziadat-onix-serum', sku: 'ONIX-SERUM', brand: 'Onix', name: { en: 'Onix serum', ar: 'سيرم Onix' }, cost: 250, sell: 500 },
    { id: 'ziadat-onix-oil', sku: 'ONIX-OIL', brand: 'Onix', name: { en: 'Onix oil bath', ar: 'حمام زيت Onix' }, cost: 230, sell: 600 },
    { id: 'ziadat-loreal-shampoo', sku: 'LOREAL-SHAMPOO', brand: 'Loreal', name: { en: 'Loreal shampoo', ar: 'شامبو لوريال' }, cost: 655, sell: 950 },
    { id: 'ziadat-loreal-conditioner', sku: 'LOREAL-COND', brand: 'Loreal', name: { en: 'Loreal conditioner', ar: 'بلسم لوريال' }, cost: 835, sell: 1150 },
    { id: 'ziadat-loreal-serum', sku: 'LOREAL-SERUM', brand: 'Loreal', name: { en: 'Loreal serum', ar: 'سيرم لوريال' }, cost: 1117, sell: 1450 },
    { id: 'ziadat-art-cream', sku: 'ART-CREAM', brand: 'Art', name: { en: 'Art cream', ar: 'كريم Art' }, cost: 619, sell: 950 },
    { id: 'ziadat-silver-shampoo', sku: 'SILVER-SHAMPOO', brand: 'Silver', name: { en: 'Silver shampoo', ar: 'شامبو سيلفر' }, cost: 655, sell: 900 },
    { id: 'ziadat-jean-francis', sku: 'JEAN-FRANCIS', brand: 'Silver', name: { en: 'Jean Francis', ar: 'جون فرانسيس' }, cost: 390, sell: 650 },
    { id: 'ziadat-asterle', sku: 'ASTERLE', brand: 'Silver', name: { en: 'Asterle', ar: 'استرله' }, cost: 120, sell: 350 },
  ];
  const LEGACY = '6aefb706d5345916d38f5c34';

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('nile-barbers');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const get = (pk) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const req = tx.objectStore('records').get(pk);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

  const puts = [];
  const putDoc = (collection, id, data, status = 'ACTIVE') => {
    puts.push({
      pk: `${collection}:${id}`,
      collection,
      id,
      branchId: '',
      status,
      updatedAt: now,
      data: { id, ...data },
    });
  };

  if (!(await get('meta:ziadat-retail-menu-2026-11-21'))) {
    // continue
  }

  putDoc('serviceCategories', CAT.id, { name: CAT.name, status: 'ACTIVE', createdAt: now, updatedAt: now });
  putDoc('productCategories', PCAT.id, { name: PCAT.name, status: 'ACTIVE', createdAt: now, updatedAt: now });

  for (const item of ITEMS) {
    const serviceId = `svc-${item.id}`;
    putDoc('services', serviceId, {
      name: item.name,
      description: { en: '', ar: '' },
      categoryId: CAT.id,
      categoryName: CAT.name,
      image: '',
      price: item.sell,
      costPrice: item.cost,
      commissionType: 'FIXED',
      commissionValue: 30,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    putDoc('products', `prd-${item.id}`, {
      name: item.name,
      sku: item.sku,
      barcode: '',
      description: { en: '', ar: '' },
      categoryId: PCAT.id,
      brand: item.brand,
      unit: 'piece',
      costPrice: item.cost,
      sellingPrice: item.sell,
      minimumStock: 0,
      image: '',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  const legacy = await get(`services:${LEGACY}`);
  if (legacy?.data) {
    putDoc('services', LEGACY, { ...legacy.data, status: 'INACTIVE', updatedAt: now }, 'INACTIVE');
  }

  putDoc('meta', 'ziadat-retail-menu-2026-11-21', { importedAt: now, count: ITEMS.length }, '');

  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const row of puts) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  console.log(
    'مبيعات added. POS sell price only, barber commission FIXED 30:',
    ITEMS.map((i) => `${i.name.ar} = ${i.sell}`),
  );
  return ITEMS.length;
})();
