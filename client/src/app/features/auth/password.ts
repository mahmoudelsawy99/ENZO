import { AbstractControl, ValidationErrors } from '@angular/forms';

export function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value || (/[A-Za-z]/.test(value) && /\d/.test(value))) {
    return null;
  }
  return { password: true };
}
