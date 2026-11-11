import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, input, output } from '@angular/core';
import type { ComponentType } from '@angular/cdk/overlay';
import { firstValueFrom, map } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from './button';
import { Icon } from './icon';

export interface ConfirmRequest {
  titleKey: string;
  messageKey: string;
  confirmKey?: string;
  cancelKey?: string;
  danger?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  confirm(request: ConfirmRequest): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmRequest>(ConfirmDialog, {
      data: request,
      panelClass: 'enzo-dialog-panel',
      backdropClass: 'enzo-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      role: 'alertdialog',
    });
    return firstValueFrom(ref.closed.pipe(map((result) => result === true)));
  }

  open<R, D>(component: ComponentType<unknown>, data?: D): DialogRef<R> {
    return this.dialog.open<R, D>(component, {
      data,
      panelClass: 'enzo-dialog-panel',
      backdropClass: 'enzo-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}

@Component({
  selector: 'enzo-dialog-shell',
  imports: [Button, Icon, TranslatePipe],
  host: { class: 'block w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-elevated shadow-panel' },
  template: `
    <header class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <h2 class="text-lg font-semibold text-text-primary">{{ title() }}</h2>
      <button enzoButton variant="ghost" iconOnly type="button" [attr.aria-label]="'common.close' | t" (click)="closed.emit()">
        <enzo-icon name="x" />
      </button>
    </header>
    <div class="px-5 py-4 text-sm leading-6 text-text-secondary">
      <ng-content />
    </div>
    <footer class="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
      <ng-content select="[enzoDialogActions]" />
    </footer>
  `,
})
export class DialogShell {
  readonly title = input.required<string>();
  readonly closed = output<void>();
}

@Component({
  selector: 'enzo-confirm-dialog',
  imports: [Button, TranslatePipe],
  host: { class: 'block w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-elevated' },
  template: `
    <header class="border-b border-border px-5 py-4">
      <h2 class="text-lg font-semibold text-text-primary">{{ data.titleKey | t }}</h2>
    </header>
    <p class="px-5 py-4 text-sm leading-6 text-text-secondary">{{ data.messageKey | t }}</p>
    <footer class="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
      <button enzoButton variant="secondary" type="button" (click)="ref.close(false)">
        {{ (data.cancelKey || 'common.cancel') | t }}
      </button>
      <button enzoButton [variant]="data.danger ? 'danger' : 'primary'" type="button" (click)="ref.close(true)">
        {{ (data.confirmKey || 'common.confirm') | t }}
      </button>
    </footer>
  `,
})
export class ConfirmDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ConfirmRequest>(DIALOG_DATA);
}
