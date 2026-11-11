import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DocumentTitle } from './core/navigation/document-title';
import { Toaster } from './shared/ui/toaster';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toaster],
  template: `
    <router-outlet />
    <enzo-toaster />
  `,
})
export class App {
  constructor() {
    inject(DocumentTitle);
  }
}
