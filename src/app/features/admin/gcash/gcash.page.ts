import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { GcashCashinsTab } from './gcash-cashins.tab';
import { GcashCashoutsTab } from './gcash-cashouts.tab';
import { GcashFeesTab } from './gcash-fees.tab';

/**
 * Admin GCash page. Three tabs:
 *
 *   Cash-ins (default) — work queue of PENDING cash-ins the admin
 *                        needs to send GCash for, plus completed
 *                        history for audit.
 *   Cash-outs          — audit list with a void action for
 *                        mistakes / disputes. Cash-outs land
 *                        COMPLETED on create, so there's no work
 *                        queue — voiding is the only action here.
 *   Fees               — fee tier CRUD.
 *
 * Cash-ins is the default because it's the operational view —
 * admins live here during the day; cash-outs and fees are
 * reactive / occasional.
 */
@Component({
  selector: 'app-gcash-page',
  imports: [MatTabsModule, GcashCashinsTab, GcashCashoutsTab, GcashFeesTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gp">
      <header class="gp__header">
        <h1>GCash</h1>
        <p>Manage cash-ins waiting to be sent, audit cash-outs, and tune the fee schedule.</p>
      </header>

      <mat-tab-group class="gp__tabs" [selectedIndex]="0" preserveContent>
        <mat-tab label="Cash-ins">
          <div class="gp__tab-content">
            <app-gcash-cashins-tab />
          </div>
        </mat-tab>
        <mat-tab label="Cash-outs">
          <div class="gp__tab-content">
            <app-gcash-cashouts-tab />
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
