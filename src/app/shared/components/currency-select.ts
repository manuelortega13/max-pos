import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { startWith } from 'rxjs';
import { CURRENCIES, Currency } from '../../core/data/currencies';

/**
 * Searchable currency picker. A {@link ControlValueAccessor} whose value is
 * the selected currency code (e.g. "USD"); filter by code or name. Derive the
 * symbol from the code with {@link symbolFor} where needed.
 */
@Component({
  selector: 'app-currency-select',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencySelect),
      multi: true,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="w-full">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [formControl]="control"
        [matAutocomplete]="auto"
        autocomplete="off"
        placeholder="Search currency"
      />
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="display"
        (optionSelected)="onSelect($event)"
      >
        @for (c of options(); track c.code) {
          <mat-option [value]="c.code">{{ c.code }} — {{ c.name }} ({{ c.symbol }})</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [
    `
      .w-full {
        width: 100%;
      }
    `,
  ],
})
export class CurrencySelect implements ControlValueAccessor {
  readonly label = input('Currency');

  protected readonly control = new FormControl<string>('', { nonNullable: true });

  private readonly query = toSignal(this.control.valueChanges.pipe(startWith('')), {
    initialValue: '',
  });

  protected readonly options = computed<readonly Currency[]>(() => {
    const q = (this.query() ?? '').trim().toLowerCase();
    if (!q) return CURRENCIES;
    // A code is already selected → show the whole list so it can be re-picked.
    if (CURRENCIES.some((c) => c.code.toLowerCase() === q)) return CURRENCIES;
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  /** Render a code as "USD — US Dollar ($)"; fall back to the raw code. */
  protected readonly display = (code: string): string => {
    const c = CURRENCIES.find((x) => x.code === code);
    return c ? `${c.code} — ${c.name} (${c.symbol})` : (code ?? '');
  };

  protected onSelect(event: MatAutocompleteSelectedEvent): void {
    this.onChange(event.option.value as string);
    this.onTouched();
  }

  writeValue(code: string | null): void {
    this.control.setValue(code ?? '', { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.control.disable();
    else this.control.enable();
  }
}
