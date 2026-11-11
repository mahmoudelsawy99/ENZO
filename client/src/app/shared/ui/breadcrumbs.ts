import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export interface BreadcrumbItem {
  labelKey: string;
  link?: string;
}

@Component({
  selector: 'enzo-breadcrumbs',
  imports: [RouterLink, TranslatePipe],
  template: `
    <nav [attr.aria-label]="'common.breadcrumb' | t">
      <ol class="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        @for (item of items(); track item.labelKey; let last = $last) {
          <li class="inline-flex items-center gap-2">
            @if (item.link && !last) {
              <a class="hover:text-text-primary" [routerLink]="item.link">{{ item.labelKey | t }}</a>
            } @else {
              <span class="text-text-primary" [attr.aria-current]="last ? 'page' : null">{{ item.labelKey | t }}</span>
            }
            @if (!last) {
              <span aria-hidden="true">/</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class Breadcrumbs {
  readonly items = input<readonly BreadcrumbItem[]>([]);
}
