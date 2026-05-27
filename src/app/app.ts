import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NavigationStart, Router } from '@angular/router';
import { RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppUpdateService } from './core/services/app-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly updateService = inject(AppUpdateService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  protected readonly updateReady = this.updateService.updateReady;

  ngOnInit(): void {
    // Begin polling for new Service Worker versions. The service is a
    // no-op when SW isn't enabled (dev mode); production builds get
    // the "Update available" banner whenever a fresh deploy lands.
    this.updateService.start();

    // Belt-and-braces for a known Material/CDK leak: when a route
    // change destroys a host component while a dialog/menu/overlay is
    // still mid-close, the cdk-overlay-backdrop can be left in the
    // DOM with pointer-events:auto — visually a dim cyan/green scrim
    // over the page that swallows clicks until full reload.
    //
    // Closing every dialog on each NavigationStart forces Material to
    // remove its overlay panes synchronously before the next route
    // mounts, eliminating the leak window. Cheap (closeAll is a no-op
    // when no dialogs are open) and behaviorally invisible — anyone
    // mid-edit when navigating away has already lost their changes.
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe(() => this.dialog.closeAll());
  }

  protected applyUpdate(): void {
    void this.updateService.apply();
  }
}
