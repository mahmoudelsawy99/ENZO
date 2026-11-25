/**
 * Paste into Chrome Console on http://localhost:8080
 * Adds/reactivates service زيادات at 120 with commission 0.
 * Does not delete other data.
 */
(async () => {
  const now = new Date().toISOString();
  const id = '6aefb706d5345916d38f5c34';
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('nile-barbers');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').get(`services:${id}`);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  const data = {
    ...(existing?.data || {}),
    id,
    name: { en: 'زيادات', ar: 'زيادات' },
    description: existing?.data?.description || { en: '', ar: '' },
    categoryId: '6aefb704d5345916d38f5bfc',
    categoryName: { en: 'Haircut and beard', ar: 'قص الشعر / الذقن' },
    image: existing?.data?.image || '',
    price: 120,
    commissionType: 'PERCENTAGE',
    commissionValue: 0,
    status: 'ACTIVE',
    createdAt: existing?.data?.createdAt || now,
    updatedAt: now,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    store.put({
      pk: `services:${id}`,
      collection: 'services',
      id,
      branchId: '',
      status: 'ACTIVE',
      updatedAt: now,
      data,
    });
    store.put({
      pk: 'meta:ziadat-service-120-2026-11-22',
      collection: 'meta',
      id: 'ziadat-service-120-2026-11-22',
      branchId: '',
      status: '',
      updatedAt: now,
      data: { id: 'ziadat-service-120-2026-11-22', appliedAt: now, price: 120 },
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  console.log('Service ready:', data.name.ar, 'price', data.price, 'commission', data.commissionValue);
  return data;
})();
