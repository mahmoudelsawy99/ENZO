import { Component, inject, signal } from '@angular/core';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ToastService } from '../../shared/ui/toast.service';
import { WhatsAppApi, type NotificationSettings, type WhatsAppConfigView, type WhatsAppMessageRow, type WhatsAppTemplateRow } from './whatsapp.api';

@Component({
  selector: 'app-whatsapp-page',
  imports: [TranslatePipe, PageHeader, Button, Card, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'whatsappCenter.title' | t" [description]="'whatsappCenter.description' | t" />
    <p class="mb-4 rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm">{{ 'whatsappCenter.untested' | t }}</p>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      @if (access.can('whatsapp.settings.view') && config(); as current) {
        <enzo-card class="mb-4" [title]="'whatsappCenter.config' | t">
          <p class="mb-3 text-sm text-text-secondary">{{ current.liveReady ? ('whatsappCenter.ready' | t) : ('whatsappCenter.notReady' | t) }}</p>
          @if (access.can('whatsapp.settings.manage')) {
            <div class="grid gap-3 md:grid-cols-2">
              <label class="grid gap-1 text-sm"><span>{{ 'whatsappCenter.phoneNumberId' | t }}</span><input class="enzo-control" [value]="phoneNumberId" (input)="phoneNumberId = inputValue($event)" /></label>
              <label class="grid gap-1 text-sm"><span>{{ 'whatsappCenter.businessAccountId' | t }}</span><input class="enzo-control" [value]="businessAccountId" (input)="businessAccountId = inputValue($event)" /></label>
              <label class="grid gap-1 text-sm"><span>{{ 'whatsappCenter.accessToken' | t }}</span><input class="enzo-control" type="password" [value]="accessToken" (input)="accessToken = inputValue($event)" /></label>
              <label class="grid gap-1 text-sm"><span>{{ 'whatsappCenter.appSecret' | t }}</span><input class="enzo-control" type="password" [value]="appSecret" (input)="appSecret = inputValue($event)" /></label>
              <label class="grid gap-1 text-sm"><span>{{ 'whatsappCenter.verifyToken' | t }}</span><input class="enzo-control" [value]="verifyToken" (input)="verifyToken = inputValue($event)" /></label>
            </div>
            <label class="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="enabled" (change)="enabled = checked($event)" />
              {{ 'whatsappCenter.enabled' | t }}
            </label>
            <button class="mt-3" enzoButton type="button" (click)="saveConfig()" [loading]="saving()">{{ 'common.save' | t }}</button>
          }
        </enzo-card>
      }
      @if (access.can('notifications.settings.manage') && settings(); as current) {
        <enzo-card class="mb-4" [title]="'whatsappCenter.notifications' | t">
          <div class="grid gap-2 text-sm">
            @for (key of settingKeys; track key) {
              <label class="flex items-center gap-2">
                <input type="checkbox" [checked]="current[key]" (change)="toggleSetting(key, checked($event))" />
                {{ 'whatsappCenter.setting.' + key | t }}
              </label>
            }
          </div>
          <button class="mt-3" enzoButton type="button" (click)="saveSettings()" [loading]="saving()">{{ 'common.save' | t }}</button>
        </enzo-card>
      }
      @if (access.can('whatsapp.settings.view')) {
        <enzo-card class="mb-4" [title]="'whatsappCenter.templates' | t">
          @if (templates().length === 0) {
            <enzo-empty-state [title]="'whatsappCenter.noTemplates' | t" [description]="'whatsappCenter.noTemplatesBody' | t" />
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (template of templates(); track template.id) {
                <li class="rounded-md border border-border px-3 py-2">
                  <span class="font-medium">{{ template.templateName }}</span>
                  <span class="text-text-secondary"> · {{ template.language }} · {{ template.status }}</span>
                  <p>{{ template.body }}</p>
                </li>
              }
            </ul>
          }
        </enzo-card>
      }
      @if (access.can('whatsapp.messages.view')) {
        <enzo-card [title]="'whatsappCenter.messages' | t">
          @if (messages().length === 0) {
            <enzo-empty-state [title]="'whatsappCenter.noMessages' | t" [description]="'whatsappCenter.noMessagesBody' | t" />
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (message of messages(); track message.id) {
                <li class="flex flex-wrap justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span>{{ message.kind }} · {{ message.language }}</span>
                  <span>{{ message.status }} · {{ message.attempts }}</span>
                </li>
              }
            </ul>
          }
        </enzo-card>
      }
    }
  `,
})
export class WhatsAppPage {
  private readonly api = inject(WhatsAppApi);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly config = signal<WhatsAppConfigView | null>(null);
  protected readonly settings = signal<NotificationSettings | null>(null);
  protected readonly templates = signal<WhatsAppTemplateRow[]>([]);
  protected readonly messages = signal<WhatsAppMessageRow[]>([]);
  protected phoneNumberId = '';
  protected businessAccountId = '';
  protected accessToken = '';
  protected appSecret = '';
  protected verifyToken = '';
  protected enabled = false;
  protected readonly settingKeys: Array<keyof NotificationSettings> = [
    'appointmentConfirmation',
    'appointmentReminder',
    'appointmentCancellation',
    'appointmentReschedule',
    'packagePurchase',
    'packageExpiry',
    'paymentReceipt',
    'promotional',
  ];

  constructor() {
    void this.access.load().then(() => this.load());
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected toggleSetting(key: keyof NotificationSettings, value: boolean): void {
    const current = this.settings();
    if (!current) return;
    this.settings.set({ ...current, [key]: value });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    if (this.access.can('whatsapp.settings.view')) {
      this.api.config().subscribe({
        next: (result) => {
          this.config.set(result.data);
          this.phoneNumberId = result.data.phoneNumberId;
          this.businessAccountId = result.data.businessAccountId;
          this.enabled = result.data.enabled;
          this.loading.set(false);
        },
        error: (error: unknown) => this.fail(error),
      });
      this.api.templates().subscribe({ next: (result) => this.templates.set(result.data), error: () => this.templates.set([]) });
    } else {
      this.loading.set(false);
    }
    if (this.access.can('notifications.settings.manage')) {
      this.api.settings().subscribe({ next: (result) => this.settings.set(result.data), error: () => undefined });
    }
    if (this.access.can('whatsapp.messages.view')) {
      this.api.messages().subscribe({ next: (result) => this.messages.set(result.data), error: () => this.messages.set([]) });
    }
  }

  protected saveConfig(): void {
    this.saving.set(true);
    this.api.saveConfig({
      phoneNumberId: this.phoneNumberId,
      businessAccountId: this.businessAccountId,
      accessToken: this.accessToken,
      appSecret: this.appSecret,
      verifyToken: this.verifyToken,
      enabled: this.enabled,
    }).subscribe({
      next: (result) => {
        this.config.set(result.data);
        this.accessToken = '';
        this.appSecret = '';
        this.verifyToken = '';
        this.saving.set(false);
        this.toast.success(this.i18n.translate('whatsappCenter.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected saveSettings(): void {
    const current = this.settings();
    if (!current) return;
    this.saving.set(true);
    this.api.saveSettings(current).subscribe({
      next: (result) => {
        this.settings.set(result.data);
        this.saving.set(false);
        this.toast.success(this.i18n.translate('whatsappCenter.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
  }
}
