import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { LoadFeesTab } from './load-fees.tab';
import { LoadTransactionsTab } from './load-transactions.tab';

/**
 * Admin load page. Two tabs:
 *
 *   Transactions (default) — work queue of PENDING loads the admin
 *                            needs to send + completed history.
 *   Fees                  — fee tier CRUD.
 */
@Component({
  selector: 'app-admin-load-page',
  imports: [MatTabsModule, LoadTransactionsTab, LoadFeesTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lp">
      <header class="lp__header">
        <h1>Load</h1>
        <p>Manage cellphone-load transactions waiting to be sent and the fee schedule.</p>
      </header>

      <mat-tab-group class="lp__tabs" [selectedIndex]="0" preserveContent>
        <mat-tab label="Transactions">
          <div class="lp__tab-content">
            <app-load-transactions-tab />
          </div>
        </mat-tab>
        <mat-tab label="Fees">
          <div class="lp__tab-content">
            <app-load-fees-tab />
          </div>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
  styles: [
    `
      .lp {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem 1.5rem;
      }
      .lp__header {
        h1 { margin: 0 0 0.2rem; font-size: 1.6rem; font-weight: 600; }
        p  { margin: 0; color: var(--mat-sys-on-surface-variant); }
      }
      .lp__tabs { background: transparent; }
      .lp__tab-content { padding: 1.25rem 0 0; }
    `,
  ],
})
export class AdminLoadPage {}
