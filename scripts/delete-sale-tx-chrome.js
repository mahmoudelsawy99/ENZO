/**
 * Paste into Chrome Console on http://localhost:8080
 * Deletes a sale by transaction number (default TX-0052).
 * Usage: change TARGET if needed, then paste & run.
 */
(async () => {
  const TARGET = 'TX-0052';

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('nile-barbers');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const allSales = await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').getAll();
    req.onsuccess = () => {
      resolve(
        (req.result || []).filter(
          (row) => row.collection === 'sales' && row.data?.transactionNumber === TARGET,
        ),
      );
    };
    req.onerror = () => reject(req.error);
  });

  if (allSales.length === 0) {
    console.warn('No sale found for', TARGET);
    db.close();
    return { deleted: 0, target: TARGET };
  }

  const pks = allSales.map((row) => row.pk);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const pk of pks) store.delete(pk);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  console.log('Deleted', pks.length, 'sale(s) for', TARGET, pks);
  return { deleted: pks.length, target: TARGET, pks };
})();
