import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Server's response after a successful restore. */
export interface RestoreSummary {
  readonly message: string;
  readonly tables: number;
  readonly rows: number;
}

/**
 * Thin HTTP layer for the admin whole-database backup/restore feature.
 * Endpoints are admin-only on the server; the auth + base-url interceptors
 * stamp the bearer token and rewrite the path like every other /api call.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);

  /** Download the full database as a JSON blob. */
  exportDatabase(): Observable<Blob> {
    return this.http.get('/api/admin/backup/export', { responseType: 'blob' });
  }

  /**
   * Replace ALL data with a backup file's contents. The file's text is sent
   * verbatim as the JSON request body (avoids multipart size limits and keeps
   * the payload byte-identical to what was exported).
   */
  importDatabase(backupJson: string): Observable<RestoreSummary> {
    return this.http.post<RestoreSummary>('/api/admin/backup/import', backupJson, {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
