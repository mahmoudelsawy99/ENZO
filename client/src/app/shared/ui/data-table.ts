import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { EmptyState } from './empty-state';
import { LoadingState } from './loading-state';

export interface TableColumn {
  key: string;
  header: string;
  align?: 'start' | 'center' | 'end';
}

@Component({
  selector: 'enzo-data-table',
  imports: [TranslatePipe, EmptyState, LoadingState],
  host: { class: 'block overflow-hidden rounded-lg border border-border bg-surface' },
  template: `
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        @if (caption()) {
          <caption class="sr-only">
            {{ caption() }}
          </caption>
        }
        <thead class="bg-surface-elevated text-text-secondary">
          <tr>
            @for (column of columns(); track column.key) {
              <th
                scope="col"
                class="px-4 py-3 text-xs font-medium"
                [class.text-start]="column.align !== 'end' && column.align !== 'center'"
                [class.text-center]="column.align === 'center'"
                [class.text-end]="column.align === 'end'"
              >
                {{ column.header }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading()) {
            <tr>
              <td [attr.colspan]="columns().length">
                <enzo-loading-state [message]="'common.loading' | t" />
              </td>
            </tr>
          } @else if (rows().length === 0) {
            <tr>
              <td [attr.colspan]="columns().length">
                <enzo-empty-state [title]="emptyTitle()" [description]="emptyDescription()" />
              </td>
            </tr>
          } @else {
            @for (row of rows(); track $index) {
              <tr class="border-t border-border transition-colors hover:bg-hover">
                @for (column of columns(); track column.key) {
                  <td
                    class="px-4 py-3 text-text-primary"
                    [class.text-start]="column.align !== 'end' && column.align !== 'center'"
                    [class.text-center]="column.align === 'center'"
                    [class.text-end]="column.align === 'end'"
                  >
                    {{ display(row[column.key]) }}
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DataTable {
  readonly columns = input.required<readonly TableColumn[]>();
  readonly rows = input<readonly Record<string, unknown>[]>([]);
  readonly loading = input(false);
  readonly caption = input('');
  readonly emptyTitle = input('');
  readonly emptyDescription = input('');

  protected display(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return '';
  }
}
