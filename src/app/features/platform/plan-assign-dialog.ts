import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Plan } from '../../core/models/platform.model';

export interface PlanAssignData {
  readonly plans: Plan[];
  readonly currentPlanId: string | null;
}

/**
 * Pick a store's plan (or "No plan"). Returns `{ planId }` on save (planId is
 * null for no plan) and undefined on cancel — distinct from a null planId.
 */
@Component({
  selector: 'app-plan-assign-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Change plan</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Plan</mat-label>
        <mat-select [(value)]="selected">
          <mat-option [value]="null">No plan</mat-option>
          @for (p of data.plans; track p.id) {
            <mat-option [value]="p.id">{{ p.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .w-full {
        width: 100%;
        min-width: 300px;
      }
    `,
  ],
})
export class PlanAssignDialog {
  protected readonly data = inject<PlanAssignData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PlanAssignDialog, { planId: string | null }>);

  protected selected: string | null = this.data.currentPlanId;

  protected save(): void {
    this.ref.close({ planId: this.selected });
  }
}
