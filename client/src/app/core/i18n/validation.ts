import type { ValidationErrors } from '@angular/forms';

type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export function firstValidationMessage(errors: ValidationErrors | null, translate: Translate): string {
  if (!errors) {
    return '';
  }
  if (errors['required']) {
    return translate('validation.required');
  }
  if (errors['email']) {
    return translate('validation.email');
  }
  if (errors['minlength']) {
    const details = errors['minlength'] as { requiredLength?: number };
    return translate('validation.minlength', { min: details.requiredLength ?? 0 });
  }
  if (errors['maxlength']) {
    const details = errors['maxlength'] as { requiredLength?: number };
    return translate('validation.maxlength', { max: details.requiredLength ?? 0 });
  }
  if (errors['password']) {
    return translate('validation.password');
  }
  if (errors['pattern']) {
    return translate('validation.pattern');
  }
  return translate('validation.invalid');
}
