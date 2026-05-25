import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
  protected readonly updateReady = this.updateService.updateReady;

  ngOnInit(): void {
    // Begin polling for new Service Worker versions. The service is a
    // no-op when SW isn't enabled (dev mode); production builds get
    // the "Update available" banner whenever a fresh deploy lands.
    this.updateService.start();
  }

  protected applyUpdate(): void {
    void this.updateService.apply();
  }
}
