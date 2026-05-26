import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

/**
 * Owner's playbook — static reference content tailored to a
 * student-focused snack/cooked-food gate-side store. Lives in a
 * floating panel triggered from the admin shell FAB so the owner
 * can keep it open while pricing products on another page.
 *
 * Hardcoded for v1. If pricing advice needs to adapt per store
 * (different demographics, no cooked food, etc.) this becomes
 * settings-driven later — same component, content fed in via input.
 */
@Component({
  selector: 'app-playbook-panel',
  imports: [MatButtonModule, MatExpansionModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './playbook-panel.html',
  styleUrl: './playbook-panel.scss',
})
export class PlaybookPanel {
  /** Emitted when the user clicks the panel's own close button.
   *  The host (admin-layout) owns the open/closed state. */
  readonly close = output<void>();
}
