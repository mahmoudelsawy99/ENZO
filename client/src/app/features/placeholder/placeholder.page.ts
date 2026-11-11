import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import type { BreadcrumbItem } from '../../shared/ui/breadcrumbs';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-placeholder-page',
  imports: [PageHeader, EmptyState, TranslatePipe],
  template: `
    <enzo-page-header
      [title]="titleKey() | t"
      [description]="descriptionKey() | t"
      [breadcrumbs]="breadcrumbs()"
    />
    <section class="rounded-lg border border-border bg-surface">
      <enzo-empty-state icon="inbox" [title]="'common.emptyTitle' | t" [description]="'common.modulePending' | t" />
    </section>
  `,
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly titleKey = computed(() => stringData(this.data(), 'titleKey'));
  readonly descriptionKey = computed(() => stringData(this.data(), 'descriptionKey'));
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: stringData(this.data(), 'groupKey') },
    { labelKey: this.titleKey() },
  ]);
}

function stringData(data: Record<string, unknown> | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}
