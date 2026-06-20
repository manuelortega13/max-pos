import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { PlatformAuditEntry } from '../../core/models/platform.model';
import { PlatformService } from '../../core/services/platform.service';

/** Friendly label + icon per audit action code. */
const ACTIONS: Record<string, { label: string; icon: string }> = {
  STORE_REGISTERED: { label: 'Store registered', icon: 'add_business' },
  STORE_SUSPENDED: { label: 'Store suspended', icon: 'block' },
  STORE_ACTIVATED: { label: 'Store activated', icon: 'check_circle' },
  STORE_EDITED: { label: 'Store edited', icon: 'edit' },
  STORE_IMPERSONATED: { label: 'Impersonated store', icon: 'login' },
  ADMIN_CREATED: { label: 'Platform admin added', icon: 'person_add' },
};

@Component({
  selector: 'app-platform-activity-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Activity</h1>
          <p>Recent platform-level actions</p>
        </div>
        <button mat-stroked-button (click)="reload()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (error(); as message) {
        <mat-card appearance="outlined" class="err">
          <mat-icon>error_outline</mat-icon><span>{{ message }}</span>
          <button mat-stroked-button (click)="reload()">Retry</button>
        </mat-card>
      }

      <mat-card appearance="outlined" class="table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="entries()" class="w-full">
            <ng-container matColumnDef="action">
              <th mat-header-cell *matHeaderCellDef>Action</th>
              <td mat-cell *matCellDef="let e">
                <div class="action">
                  <mat-icon>{{ icon(e.action) }}</mat-icon>
                  <span>{{ label(e.action) }}</span>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="target">
              <th mat-header-cell *matHeaderCellDef>Target</th>
              <td mat-cell *matCellDef="let e">
                <div class="cell">
                  <strong>{{ e.targetLabel || '—' }}</strong>
                  @if (e.detail) {
                    <small>{{ e.detail }}</small>
                  }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="actor">
              <th mat-header-cell *matHeaderCellDef>By</th>
              <td mat-cell *matCellDef="let e">{{ e.actorEmail || 'System' }}</td>
            </ng-container>
            <ng-container matColumnDef="when">
              <th mat-header-cell *matHeaderCellDef>When</th>
              <td mat-cell *matCellDef="let e">{{ e.at | date: 'medium' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr *matNoDataRow>
              <td [attr.colspan]="columns.length" class="no-data">No activity yet.</td>
            </tr>
          </table>
        </div>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .wrap {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .head h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .head p {
        margin: 0.2rem 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .table-card {
        overflow: hidden;
      }
      .table-wrap {
        overflow-x: auto;
      }
      .w-full {
        width: 100%;
      }
      .action {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
      }
      .action mat-icon {
        color: var(--mat-sys-primary);
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
      }
      .cell {
        display: flex;
        flex-direction: column;
      }
      .cell small {
        color: var(--mat-sys-on-surface-variant);
      }
      .err {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-color: var(--mat-sys-error) !important;
      }
      .err mat-icon {
        color: var(--mat-sys-error);
      }
      .no-data {
        padding: 2rem;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PlatformActivityPage {
  private readonly platform = inject(PlatformService);

  protected readonly entries = signal<PlatformAuditEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly columns = ['action', 'target', 'actor', 'when'] as const;

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.listActivity(200).subscribe({
      next: (list) => {
        this.entries.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load activity.');
      },
    });
  }

  protected label(action: string): string {
    return ACTIONS[action]?.label ?? action;
  }

  protected icon(action: string): string {
    return ACTIONS[action]?.icon ?? 'history';
  }
}
