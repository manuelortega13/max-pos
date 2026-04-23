import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { User, UserCreateRequest, UserUpdateRequest } from '../../../core/models';
import { UserService } from '../../../core/services/user.service';

export type UserFormMode = 'create' | 'edit' | 'reset-password';

export interface UserFormData {
  readonly mode: UserFormMode;
  readonly user?: User;
}

@Component({
  selector: 'app-user-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-form-dialog.html',
  styleUrl: './user-form-dialog.scss',
})
export class UserFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<UserFormData>(MAT_DIALOG_DATA);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['CASHIER', Validators.required],
    active: [true],
    password: [''],
  });

  constructor() {
    const u = this.data.user;
    if (this.data.mode === 'create') {
      this.form.controls.password.setValidators([
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128),
      ]);
    } else if (this.data.mode === 'reset-password') {
      this.form.controls.password.setValidators([
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128),
      ]);
    } else {
      // edit: password optional
      this.form.controls.password.setValidators([Validators.minLength(8), Validators.maxLength(128)]);
    }
    this.form.controls.password.updateValueAndValidity();

    if (u) {
      this.form.patchValue({
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
      });
    }

    if (this.data.mode === 'reset-password') {
      this.form.controls.name.disable();
      this.form.controls.email.disable();
      this.form.controls.role.disable();
      this.form.controls.active.disable();
    }
  }

  protected get title(): string {
    switch (this.data.mode) {
      case 'create':
        return 'Invite user';
      case 'edit':
        return 'Edit user';
      case 'reset-password':
        return 'Reset password';
    }
  }

  protected get submitLabel(): string {
    if (this.data.mode === 'create') return 'Invite';
    if (this.data.mode === 'reset-password') return 'Set password';
    return 'Save changes';
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update((v) => !v);
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    const obs =
      this.data.mode === 'create'
        ? this.userService.create({
            name: value.name,
            email: value.email,
            role: value.role,
            active: value.active,
            password: value.password,
          } as UserCreateRequest)
        : this.userService.update(this.data.user!.id, {
            name: value.name,
            email: value.email,
            role: value.role,
            active: value.active,
            password: value.password ? value.password : null,
          } as UserUpdateRequest);

    obs.subscribe({
      next: (user) => {
        const verb =
          this.data.mode === 'create'
            ? 'Invited'
            : this.data.mode === 'reset-password'
              ? 'Password reset for'
              : 'Updated';
        this.snackBar.open(`${verb} "${user.name}"`, 'Dismiss', { duration: 2500 });
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 409) return err.error?.message ?? 'Email already in use.';
    if (err.status === 400) return err.error?.message ?? 'Validation failed.';
    if (err.status === 403) return 'Only admins can manage users.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? 'Something went wrong.';
  }
}
