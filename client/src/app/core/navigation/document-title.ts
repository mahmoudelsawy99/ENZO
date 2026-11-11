import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { LanguageService } from '../i18n/language.service';

@Injectable({ providedIn: 'root' })
export class DocumentTitle {
  constructor() {
    const router = inject(Router);
    const title = inject(Title);
    const i18n = inject(LanguageService);
    const navigation = toSignal(
      router.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => router.routerState.snapshot),
        startWith(router.routerState.snapshot),
      ),
      { initialValue: router.routerState.snapshot },
    );

    effect(() => {
      i18n.language();
      i18n.ready();
      let route = navigation().root;
      let key = '';
      while (route.firstChild) {
        route = route.firstChild;
        const value = route.data['titleKey'];
        if (typeof value === 'string') {
          key = value;
        }
      }
      const page = key ? i18n.translate(key) : 'ENZO';
      title.setTitle(page === 'ENZO' || page === key ? 'ENZO' : `${page} · ENZO`);
    });
  }
}
