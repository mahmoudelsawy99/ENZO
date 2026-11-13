export interface ShopBarber {
  id: string;
  fullName: string;
}

/** Active Cairo barbers. Shown in the shop even when the barber request is refused. */
export const SHOP_BARBERS: ShopBarber[] = [
  { id: '6af0f4edd5345916d38f5c87', fullName: 'Mahmoud Elsawy' },
  { id: '6af5e33f23bc1bb5c8483406', fullName: 'احمد جمال قرشي' },
  { id: '6af5e33f23bc1bb5c848340a', fullName: 'السيد اسامة محمد السيد' },
  { id: '6af5e34023bc1bb5c848340e', fullName: 'عزت حسن عزت' },
  { id: '6af5e34023bc1bb5c8483412', fullName: 'احمد مطاوع' },
];

export function mergeBarbers(remote: ShopBarber[]): ShopBarber[] {
  const byId = new Map(SHOP_BARBERS.map((barber) => [barber.id, barber]));
  for (const barber of remote) {
    if (barber.id && barber.fullName) {
      byId.set(barber.id, barber);
    }
  }
  return [...byId.values()];
}
