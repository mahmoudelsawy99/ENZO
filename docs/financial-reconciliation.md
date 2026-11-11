# Financial calculations

Money is stored in major units. Sums convert to minor units and back, so `0.1 + 0.2` does not leak into a total. A completed appointment is not a sale. `SaleTransaction` is the source of truth for shop money. Subscription invoices are a different set of collections and never create a sale.

## Appointment and checkout

- Service line = unit price × quantity, using the price at booking.
- Subtotal = sum of service and product lines.
- Total = subtotal − manual discount − package discount.
- Payments must add up to the total. A mismatch is rejected and no sale is stored.
- Checkout before the appointment is completed is rejected.
- Cash checkout requires an open cashier shift.
- The same idempotency key returns the original sale. A second key for an appointment that already has a sale is `duplicate_checkout`.
- Changing a service price or a commission rule later does not rewrite the sale or its commission snapshot.

Phase 12 checked this on an in-memory tenant: subtotal 380, discount 10, total 370, payments 200 card + 170 cash, cash tip 20.

## Commission

- A percentage rule applies to the service line before the manual discount. At 15%, two haircuts at 150 contribute 45 and a beard at 80 contributes 12.
- An employee override applies only to sales created after the override.
- Payroll reads the snapshot amounts, not the current rule.

## Cashier expected cash

For the shift that is open:

`opening balance + cash sales + cash tips − cash refunds`

Card, wallet, and InstaPay payments do not change expected cash. A refund reduces it only when the refund method is cash and the refund has been approved. Closing the shift stores that expected cash, the counted cash, and the difference.

Phase 12 checked opening 100, cash sales 210, cash tips 20, then a 40 cash refund: expected cash 290. Counted cash of 290 closed with a difference of 0.

## Customer spending

- `totalPaid` = sum of `paidAmount` on that customer's sales.
- `totalRefunds` = sum of `refundedAmount`.
- `netSpending` = `totalPaid − totalRefunds`.
- The spending figure shown on the customer is `netSpending`.

## Refunds

- A refund is requested against one payment and then approved.
- The approved amount cannot exceed the remaining amount of that payment (`refund_limit`).
- Approving the same request twice is not a second refund. A new request above the remainder is rejected.
- A full refund is the sum of the remaining payment amounts. Phase 6 covers that path through to status `REFUNDED`.

## Packages

- Remaining uses start at the purchased quantity.
- A redemption decrements remaining and used together.
- Asking for more than the remainder returns `insufficient_quantity` and leaves the remainder unchanged.
- An expired package returns `package_expired` and leaves the remainder unchanged.
- The stored remainder cannot be negative.

## Inventory

- On-hand quantity never drops below zero. Removing more than the branch holds returns `insufficient_stock`.
- Weighted average cost, when a receipt recalculates it: `(on hand × current average + received quantity × unit cost) / new on hand`, in minor units, rounded to the nearest minor unit.
- A sale removes quantity and does not change the average. A refund restocks only when the refund asks to restock.
- Low stock is on hand greater than zero and at or below the branch minimum.
- Out of stock is on hand equal to zero.
- A row cannot be both low and out.
- Supplier payments stay on the purchase. They are not cashier cash and they are not customer sales.

## Payroll

- Commission and tips come from the snapshots and tip rows on sales in the period.
- Absence, lateness, and early leave are counted only from attendance documents that exist.
- A calendar day with no attendance document is not counted as absent.
- Approved unpaid leave is counted from the leave request, not from a missing attendance row.
- Monthly basic salary is the employee salary. It is not reduced just because days have no attendance row.
- A paid payroll record is not edited. A correction creates a new record and leaves the original in place.

## Subscription billing

- Shop sales and subscription invoices are separate.
- A manual subscription payment records gateway `MANUAL` and does not insert a `SaleTransaction`.
- MRR includes active subscriptions only. A trial and the zero-price legacy plan contribute 0. Yearly price is divided by 12. ARR is MRR × 12.
- Collected this month is the sum of paid subscription payments in the current UTC month.
