/**
 * Paste into Chrome Console on http://localhost:8080
 * Adds L'Oreal oil bath small/large to مبيعات.
 * POS shows sell price only. Barber commission FIXED 30.
 * Does not delete other data.
 */
(async () => {
  const now = new Date().toISOString();
  const CAT = { id: 'cat-ziadat', name: { en: 'Sales', ar: 'مبيعات' } };
  const PCAT = 'pcat-ziadat';
  const ITEMS = [
    { id: 'ziadat-loreal-oil-small', sku: 'LOREAL-OIL-S', brand: 'Loreal', name: { en: 'Loreal oil bath small', ar: 'حمام زيت لوريال صغير' }, cost: 1130, sell: 1650 },
    { id: 'ziadat-loreal-oil-large', sku: 'LOREAL-OIL-L', brand: 'Loreal', name: { en: 'Loreal oil bath large', ar: 'حمام زيت لوريال كبير' }, cost: 1130, sell: 2100 },
  ];

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
  for (const item of ITEMS) {
    const serviceId = `svc-${item.id}`;
    if (!(await get(`services:${serviceId}`))) {
      puts.push({
        pk: `services:${serviceId}`,
        collection: 'services',
        id: serviceId,
        branchId: '',
        status: 'ACTIVE',
        updatedAt: now,
        data: {
          id: serviceId,
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
        },
      });
    }
    const productId = `prd-${item.id}`;
    if (!(await get(`products:${productId}`))) {
      puts.push({
        pk: `products:${productId}`,
        collection: 'products',
        id: productId,
        branchId: '',
        status: 'ACTIVE',
        updatedAt: now,
        data: {
          id: productId,
          name: item.name,
          sku: item.sku,
          barcode: '',
          description: { en: '', ar: '' },
          categoryId: PCAT,
          brand: item.brand,
          unit: 'piece',
          costPrice: item.cost,
          sellingPrice: item.sell,
          minimumStock: 0,
          image: '',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }
  puts.push({
    pk: 'meta:mabeaat-loreal-oil-baths-2026-11-22',
    collection: 'meta',
    id: 'mabeaat-loreal-oil-baths-2026-11-22',
    branchId: '',
    status: '',
    updatedAt: now,
    data: { id: 'mabeaat-loreal-oil-baths-2026-11-22', appliedAt: now, count: 2 },
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const row of puts) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  console.log(
    'Added to مبيعات:',
    ITEMS.map((i) => `${i.name.ar} sell=${i.sell} buy=${i.cost} commission=30`),
  );
  return ITEMS.length;
})();
