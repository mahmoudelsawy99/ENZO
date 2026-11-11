import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<readonly ToastMessage[]>([]);

  show(tone: ToastTone, message: string): void {
    const id = ++this.nextId;
    this.toasts.update((items) => [...items, { id, tone, message }]);
    window.setTimeout(() => this.dismiss(id), 4500);
  }

  success(message: string): void {
    this.show('success', message);
  }

  info(message: string): void {
    this.show('info', message);
  }

  warning(message: string): void {
    this.show('warning', message);
  }

  danger(message: string): void {
    this.show('danger', message);
  }

  dismiss(id: number): void {
    this.toasts.update((items) => items.filter((item) => item.id !== id));
  }
}
