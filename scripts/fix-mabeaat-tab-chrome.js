/**
 * Paste into Chrome Console on http://localhost:8080
 * Renames زيادات → مبيعات and sets FIXED barber commission 30.
 * Does not delete sales or other data.
 */
(async () => {
  const now = new Date().toISOString();
  const CAT = { id: 'cat-ziadat', name: { en: 'Sales', ar: 'مبيعات' } };
  const PCAT = 'pcat-ziadat';
  const IDS = [
    'svc-ziadat-onix-serum',
    'svc-ziadat-onix-oil',
    'svc-ziadat-loreal-shampoo',
    'svc-ziadat-loreal-conditioner',
    'svc-ziadat-loreal-serum',
    'svc-ziadat-art-cream',
    'svc-ziadat-silver-shampoo',
    'svc-ziadat-jean-francis',
    'svc-ziadat-asterle',
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
  const put = (row) => puts.push(row);

  for (const [collection, id] of [
    ['serviceCategories', CAT.id],
    ['productCategories', PCAT],
  ]) {
    const row = await get(`${collection}:${id}`);
    if (row?.data) {
      put({
        ...row,
        updatedAt: now,
        data: { ...row.data, name: CAT.name, updatedAt: now },
      });
    }
  }

  const summary = [];
  for (const id of IDS) {
    const row = await get(`services:${id}`);
    if (!row?.data) continue;
    const data = {
      ...row.data,
      categoryId: CAT.id,
      categoryName: CAT.name,
      commissionType: 'FIXED',
      commissionValue: 30,
      updatedAt: now,
    };
    put({ ...row, status: data.status || 'ACTIVE', updatedAt: now, data });
    summary.push({ name: data.name?.ar, sell: data.price, commission: 30 });
  }

  put({
    pk: 'meta:mabeaat-tab-commission-30-2026-11-21',
    collection: 'meta',
    id: 'mabeaat-tab-commission-30-2026-11-21',
    branchId: '',
    status: '',
    updatedAt: now,
    data: { id: 'mabeaat-tab-commission-30-2026-11-21', appliedAt: now },
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const row of puts) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  console.log('مبيعات tab ready. Fixed commission 30:', summary);
  return summary;
})();
