import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface StoreEditData {
  readonly name: string;
  readonly slug: string;
}

/** Edit a store's name + slug. Returns {name, slug} on save, undefined on cancel. */
@Component({
  selector: 'app-store-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Edit store</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Store name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Store URL (slug)</mat-label>
          <input matInput formControlName="slug" />
          @if (form.controls.slug.hasError('pattern')) {
            <mat-error>Lowercase letters, numbers, and hyphens only.</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        padding-top: 0.5rem;
        min-width: 320px;
      }
      .w-full {
        width: 100%;
      }
    `,
  ],
})
export class StoreEditDialog {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<StoreEditDialog, StoreEditData>);
  private readonly data = inject<StoreEditData>(MAT_DIALOG_DATA);

  protected readonly form = this.fb.nonNullable.group({
    name: [this.data.name, [Validators.required, Validators.maxLength(255)]],
    slug: [
      this.data.slug,
      [Validators.required, Validators.maxLength(64), Validators.pattern('[a-z0-9-]+')],
    ],
  });

  protected save(): void {
    if (this.form.invalid) return;
    this.ref.close(this.form.getRawValue());
  }
}
