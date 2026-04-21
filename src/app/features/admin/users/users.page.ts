import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { UserService } from '../../../core/services/user.service';
import { UserRole } from '../../../core/models';

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

  protected readonly search = signal('');
  protected readonly roleFilter = signal<RoleFilter>('all');

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

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
