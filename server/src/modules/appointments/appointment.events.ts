/**
 * Integration point for a future notification channel.
 * Listeners are called after the database transaction commits.
 * WhatsApp and other deliveries are intentionally not implemented here.
 */
export type AppointmentEventName =
  | 'appointment.created'
  | 'appointment.confirmed'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.checked_in'
  | 'appointment.completed';

export interface AppointmentEvent {
  name: AppointmentEventName;
  tenantId: string;
  branchId: string;
  appointmentId: string;
  at: string;
}

type AppointmentListener = (event: AppointmentEvent) => void;

const listeners: AppointmentListener[] = [];

export function onAppointmentEvent(listener: AppointmentListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

export function publishAppointmentEvent(event: AppointmentEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A notification failure must not undo the appointment.
    }
  }
}
