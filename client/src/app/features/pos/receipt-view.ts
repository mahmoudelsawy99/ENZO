import { Component, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Card } from '../../shared/ui/card';
import type { SaleRecord } from './finance.models';

@Component({
  selector: 'app-receipt-view',
  imports: [TranslatePipe, Badge, Card],
  template: `
    @if (sale(); as receipt) {
      <enzo-card [title]="'finance.receipt' | t">
        <div class="grid gap-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium text-text-primary">{{ receipt.transactionNumber }}</span>
            <enzo-badge tone="success">{{ 'status.' + receipt.status | t }}</enzo-badge>
          </div>
          <p>{{ receipt.customerName }}</p>
          <p class="text-text-secondary">{{ 'finance.cashier' | t }}: {{ receipt.cashierName }}</p>
          <ul class="mt-2 grid gap-2">
            @for (item of receipt.items; track $index) {
              <li class="flex justify-between gap-3">
                <span>{{ label(item.serviceName) }} × {{ text(item.quantity) }}</span>
                <span>{{ money(item.lineTotal) }}</span>
              </li>
            }
          </ul>
          <div class="mt-2 grid gap-1 border-t border-border pt-2">
            <div class="flex justify-between"><span>{{ 'finance.subtotal' | t }}</span><span>{{ money(receipt.subtotal) }}</span></div>
            <div class="flex justify-between"><span>{{ 'finance.packageDiscount' | t }}</span><span>{{ money(receipt.packageDiscount) }}</span></div>
            <div class="flex justify-between"><span>{{ 'finance.additionalDiscount' | t }}</span><span>{{ money(receipt.manualDiscount) }}</span></div>
            <div class="flex justify-between font-medium"><span>{{ 'finance.total' | t }}</span><span>{{ money(receipt.totalAmount) }}</span></div>
            <div class="flex justify-between"><span>{{ 'finance.tips' | t }}</span><span>{{ money(receipt.tipTotal) }}</span></div>
            <div class="flex justify-between"><span>{{ 'finance.refunded' | t }}</span><span>{{ money(receipt.refundedAmount) }}</span></div>
          </div>
          <ul class="mt-2 grid gap-1">
            @for (payment of receipt.payments; track payment.id) {
              <li class="flex justify-between gap-3">
                <span>{{ 'finance.methods.' + payment.method | t }}</span>
                <span>{{ money(payment.amount) }}</span>
              </li>
            }
          </ul>
          <p class="text-xs text-text-secondary">{{ 'finance.receiptNote' | t }}</p>
        </div>
      </enzo-card>
    }
  `,
})
export class ReceiptView {
  private readonly i18n = inject(LanguageService);
  readonly sale = input.required<SaleRecord>();

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }
}
