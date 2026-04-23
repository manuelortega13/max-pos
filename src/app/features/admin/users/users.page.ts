import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { User, UserRole } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { UserFormDialog } from './user-form-dialog';

type RoleFilter = UserRole | 'all';

@Component({
  selector: 'app-users-page',
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
})
export class UsersPage {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly search = signal('');
  protected readonly roleFilter = signal<RoleFilter>('all');
  protected readonly loading = this.userService.loading;
  protected readonly error = this.userService.error;
  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? null);

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.userService.users().filter((user) => {
      if (role !== 'all' && user.role !== role) return false;
      if (!term) return true;
      return user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
    });
  });

  protected readonly columns = ['name', 'email', 'role', 'createdAt', 'active', 'actions'] as const;

  protected retry(): void {
    this.userService.load();
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  protected openInvite(): void {
    this.dialog.open(UserFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'create' },
    });
  }

  protected openEdit(user: User): void {
    this.dialog.open(UserFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'edit', user },
    });
  }

  protected openResetPassword(user: User): void {
    this.dialog.open(UserFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'reset-password', user },
    });
  }

  protected toggleActive(user: User): void {
    if (user.id === this.currentUserId()) {
      this.snackBar.open("You can't deactivate yourself.", 'Dismiss', { duration: 3000 });
      return;
    }
    this.userService
      .update(user.id, {
        name: user.name,
        email: user.email,
        role: user.role,
        active: !user.active,
      })
      .subscribe({
        next: (updated) => {
          const verb = updated.active ? 'Reactivated' : 'Deactivated';
          this.snackBar.open(`${verb} "${updated.name}"`, 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Update failed.', 'Dismiss', { duration: 4000 });
        },
      });
  }

  protected confirmDelete(user: User): void {
    if (user.id === this.currentUserId()) {
      this.snackBar.open("You can't delete yourself.", 'Dismiss', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete user',
        message: `Remove "${user.name}"? They lose access immediately and the user can't be recovered.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'person_remove',
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.userService.delete(user.id).subscribe({
        next: () => this.snackBar.open(`Deleted "${user.name}"`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          const msg =
            err.error?.message ??
            (err.status === 409
              ? 'Cannot delete — user has existing sales attributed to them.'
              : 'Delete failed.');
          this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
