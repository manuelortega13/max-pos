import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { GcashCashinsTab } from './gcash-cashins.tab';
import { GcashFeesTab } from './gcash-fees.tab';

/**
 * Admin GCash page. Two tabs:
 *
 *   Cash-ins (default) — work queue of PENDING cash-ins the admin
 *                        needs to send GCash for, plus completed
 *                        history for audit.
 *   Fees               — fee tier CRUD.
 *
 * Cash-ins is the default because it's the operational view —
 * admins live here during the day; fees rarely change.
 */
@Component({
  selector: 'app-gcash-page',
  imports: [MatTabsModule, GcashCashinsTab, GcashFeesTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gp">
      <header class="gp__header">
        <h1>GCash</h1>
        <p>Manage cash-ins waiting to be sent and the fee schedule that drives both directions.</p>
      </header>

      <mat-tab-group class="gp__tabs" [selectedIndex]="0" preserveContent>
        <mat-tab label="Cash-ins">
          <div class="gp__tab-content">
            <app-gcash-cashins-tab />
          </div>
        </mat-tab>
        <mat-tab label="Fees">
          <div class="gp__tab-content">
            <app-gcash-fees-tab />
          </div>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
  styles: [
    `
      .gp {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem 1.5rem;
      }
      .gp__header {
        h1 { margin: 0 0 0.2rem; font-size: 1.6rem; font-weight: 600; }
        p  { margin: 0; color: var(--mat-sys-on-surface-variant); }
      }
      .gp__tabs { background: transparent; }
      .gp__tab-content { padding: 1.25rem 0 0; }
    `,
  ],
})
export class GcashPage {}
