import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';

export interface WhatsAppConfigView {
  phoneNumberId: string;
  businessAccountId: string;
  enabled: boolean;
  tokenSet: boolean;
  appSecretSet: boolean;
  verifyTokenSet: boolean;
  liveReady: boolean;
  liveMessagingTested: boolean;
}

export interface NotificationSettings {
  appointmentConfirmation: boolean;
  appointmentReminder: boolean;
  appointmentCancellation: boolean;
  appointmentReschedule: boolean;
  packagePurchase: boolean;
  packageExpiry: boolean;
  paymentReceipt: boolean;
  promotional: boolean;
}

export interface WhatsAppTemplateRow {
  id: string;
  kind: string;
  language: string;
  templateName: string;
  body: string;
  status: 'LOCAL' | 'APPROVED';
}

export interface WhatsAppMessageRow {
  id: string;
  customerId: string;
  kind: string;
  language: string;
  templateName: string;
  parameterCount: number;
  status: string;
  attempts: number;
  lastError: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class WhatsAppApi {
  private readonly api = inject(ApiClient);

  config() {
    return this.api.get<{ data: WhatsAppConfigView }>('/v1/whatsapp/config');
  }

  saveConfig(body: Record<string, unknown>) {
    return this.api.put<{ data: WhatsAppConfigView }>('/v1/whatsapp/config', body);
  }

  settings() {
    return this.api.get<{ data: NotificationSettings }>('/v1/whatsapp/notification-settings');
  }

  saveSettings(body: NotificationSettings) {
    return this.api.put<{ data: NotificationSettings }>('/v1/whatsapp/notification-settings', body);
  }

  templates() {
    return this.api.get<{ data: WhatsAppTemplateRow[] }>('/v1/whatsapp/templates');
  }

  messages() {
    return this.api.get<{ data: WhatsAppMessageRow[] }>('/v1/whatsapp/messages');
  }

  preferences(customerId: string, body: { promotionalOptIn: boolean; whatsappOptOut: boolean }) {
    return this.api.patch<{ data: { promotionalOptIn: boolean; whatsappOptOut: boolean } }>(`/v1/whatsapp/customers/${customerId}/preferences`, body);
  }
}
