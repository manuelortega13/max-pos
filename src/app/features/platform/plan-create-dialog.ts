import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CreatePlanRequest } from '../../core/models/platform.model';

/**
 * Create a subscription plan. Price is entered in dollars (converted to
 * cents) and blank limits mean unlimited. Returns the payload on save.
 */
@Component({
  selector: 'app-plan-create-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add plan</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Code</mat-label>
          <input matInput formControlName="code" placeholder="e.g. starter" />
          <mat-hint>Lowercase identifier, unique.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Price per month</mat-label>
          <span matTextPrefix>$&nbsp;</span>
          <input matInput type="number" min="0" step="0.01" formControlName="price" />
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Max users</mat-label>
            <input matInput type="number" min="0" formControlName="maxUsers" />
            <mat-hint>Blank = unlimited</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Max products</mat-label>
            <input matInput type="number" min="0" formControlName="maxProducts" />
            <mat-hint>Blank = unlimited</mat-hint>
          </mat-form-field>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="save()">
        Create
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        padding-top: 0.5rem;
        min-width: 340px;
      }
      .w-full {
        width: 100%;
      }
      .row {
        display: flex;
        gap: 0.75rem;
      }
      .row mat-form-field {
        flex: 1;
      }
    `,
  ],
})
export class PlanCreateDialog {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<PlanCreateDialog, CreatePlanRequest>);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    code: ['', [Validators.required, Validators.maxLength(32)]],
    price: [0, [Validators.required, Validators.min(0)]],
    maxUsers: [null as number | null, [Validators.min(0)]],
    maxProducts: [null as number | null, [Validators.min(0)]],
  });

  protected save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.ref.close({
      name: v.name!.trim(),
      code: v.code!.trim().toLowerCase(),
      priceCents: Math.round((v.price ?? 0) * 100),
      maxUsers: v.maxUsers ?? null,
      maxProducts: v.maxProducts ?? null,
      sortOrder: 0,
    });
  }
}
