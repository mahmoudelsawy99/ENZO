import { DestroyRef, Directive, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl, type ControlValueAccessor } from '@angular/forms';
import { LanguageService } from '../../core/i18n/language.service';
import { firstValidationMessage } from '../../core/i18n/validation';

let fieldSequence = 0;

export function createFieldId(): string {
  fieldSequence += 1;
  return `enzo-field-${fieldSequence}`;
}

export function fieldMessageId(inputId: string): string {
  return `${inputId}-message`;
}

@Directive()
export abstract class EnzoValueAccessor<T> implements ControlValueAccessor {
  protected readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(LanguageService);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly stateTick = signal(0);

  protected readonly value = signal<T>(this.emptyValue());
  protected readonly isDisabled = signal(false);
  protected onChange: (value: T) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected abstract emptyValue(): T;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  ngOnInit(): void {
    queueMicrotask(() => {
      this.ngControl?.control?.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.stateTick.update((count) => count + 1);
      });
    });
  }

  writeValue(value: T | null): void {
    this.value.set(value ?? this.emptyValue());
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  protected commit(next: T): void {
    this.value.set(next);
    this.onChange(next);
  }

  protected markTouched(): void {
    this.onTouched();
    this.stateTick.update((count) => count + 1);
  }

  protected validationError(): string {
    this.stateTick();
    this.i18n.language();
    const control = this.ngControl?.control;
    if (!control || (!control.touched && !control.dirty)) {
      return '';
    }
    return firstValidationMessage(control.errors, (key, params) => this.i18n.translate(key, params));
  }
}
