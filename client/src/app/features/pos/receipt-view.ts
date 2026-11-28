import { Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import type { SaleRecord } from './finance.models';

@Component({
  selector: 'app-receipt-view',
  imports: [TranslatePipe, Badge, Button, Card],
  template: `
    @if (receipt(); as receipt) {
      <div class="mb-3">
        <button enzoButton type="button" (click)="print()">{{ 'finance.printInvoice' | t }}</button>
      </div>
      <enzo-card [title]="'finance.receipt' | t">
        <div class="grid gap-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium text-text-primary">{{ receipt.transactionNumber }}</span>
            <enzo-badge tone="success">{{ 'status.' + receipt.status | t }}</enzo-badge>
          </div>
          <p>{{ receipt.customerName }}</p>
          @if (receipt.customerPhone) {
            <p class="text-text-secondary">{{ receipt.customerPhone }}</p>
          }
          @if (receipt.referralSource) {
            <p class="text-text-secondary">
              {{ 'finance.referralSource' | t }}:
              @if (receipt.referralSource === 'OTHER' && receipt.referralOther) {
                {{ receipt.referralOther }}
              } @else {
                {{ 'finance.referralSources.' + receipt.referralSource | t }}
              }
            </p>
          }
          <p class="text-text-secondary">{{ 'finance.cashier' | t }}: {{ receipt.cashierName }}</p>
          <ul class="mt-2 grid gap-2">
            @for (item of receipt.items; track $index) {
              <li class="flex justify-between gap-3">
                <span>
                  {{ label(item.serviceName) }} × {{ text(item.quantity) }}
                  @if (item.barberName) {
                    <span class="block text-xs text-text-secondary">{{ 'finance.barber' | t }}: {{ item.barberName }}</span>
                  }
                </span>
                <span>{{ money(item.lineTotal) }}</span>
              </li>
            }
          </ul>
          <div class="mt-2 grid gap-1 border-t border-border pt-2">
            <div class="flex justify-between"><span>{{ 'finance.cashBefore' | t }}</span><span>{{ money(receipt.subtotal) }}</span></div>
            @if (receipt.packageDiscount > 0) {
              <div class="flex justify-between"><span>{{ 'finance.packageDiscount' | t }}</span><span>−{{ money(receipt.packageDiscount) }}</span></div>
            }
            <div class="flex justify-between"><span>{{ 'finance.offerAmount' | t }}</span><span>−{{ money(receipt.manualDiscount) }}</span></div>
            <div class="flex justify-between font-medium"><span>{{ 'finance.cashAfter' | t }}</span><span>{{ money(receipt.totalAmount) }}</span></div>
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
      <article class="xprinter-ticket" dir="rtl">
        <h1>Nile Barbers</h1>
        <p class="ticket-title">{{ 'finance.invoice' | t }}</p>
        <p>{{ receipt.transactionNumber }}</p>
        <p>{{ when(receipt.createdAt) }}</p>
        <p>{{ receipt.customerName }}</p>
        @if (receipt.customerPhone) {
          <p>{{ receipt.customerPhone }}</p>
        }
        <p>{{ 'finance.cashier' | t }}: {{ receipt.cashierName }}</p>
        <ul>
          @for (item of receipt.items; track $index) {
            <li>
              <span>{{ label(item.serviceName) }} × {{ text(item.quantity) }}</span>
              <span>{{ money(item.lineTotal) }}</span>
            </li>
          }
        </ul>
        <p class="ticket-row"><span>{{ 'finance.cashBefore' | t }}</span><span>{{ money(receipt.subtotal) }}</span></p>
        @if (receipt.totalDiscount > 0) {
          <p class="ticket-row"><span>{{ 'finance.offerAmount' | t }}</span><span>−{{ money(receipt.totalDiscount) }}</span></p>
        }
        <p class="ticket-total"><span>{{ 'finance.cashAfter' | t }}</span><span>{{ money(receipt.totalAmount) }}</span></p>
        @for (payment of receipt.payments; track payment.id) {
          <p class="ticket-row">
            <span>{{ 'finance.methods.' + payment.method | t }}</span>
            <span>{{ money(payment.amount) }}</span>
          </p>
        }
        <p class="ticket-thanks">{{ 'finance.invoiceThanks' | t }}</p>
        <p class="ticket-width">80 × 80 mm</p>
      </article>
    }
  `,
})
export class ReceiptView {
  private readonly i18n = inject(LanguageService);
  readonly sale = input<SaleRecord | null>(null);
  protected readonly receipt = computed(() => this.sale());

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected when(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(this.i18n.language() === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  protected print(): void {
    window.print();
  }
}
