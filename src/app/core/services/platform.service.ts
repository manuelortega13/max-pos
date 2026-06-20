import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreatePlatformAdminRequest,
  ImpersonationResponse,
  PlatformAdminAccount,
  PlatformStore,
} from '../models/platform.model';

/** Store-management calls for the platform console (admin-only on the server). */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);

  listStores(): Observable<PlatformStore[]> {
    return this.http.get<PlatformStore[]>('/api/platform/stores');
  }

  getStore(id: string): Observable<PlatformStore> {
    return this.http.get<PlatformStore>(`/api/platform/stores/${id}`);
  }

  suspend(id: string): Observable<PlatformStore> {
    return this.http.post<PlatformStore>(`/api/platform/stores/${id}/suspend`, {});
  }

  activate(id: string): Observable<PlatformStore> {
    return this.http.post<PlatformStore>(`/api/platform/stores/${id}/activate`, {});
  }

  updateStore(id: string, body: { name: string; slug: string }): Observable<PlatformStore> {
    return this.http.put<PlatformStore>(`/api/platform/stores/${id}`, body);
  }

  impersonate(id: string): Observable<ImpersonationResponse> {
    return this.http.post<ImpersonationResponse>(`/api/platform/stores/${id}/impersonate`, {});
  }

  listAdmins(): Observable<PlatformAdminAccount[]> {
    return this.http.get<PlatformAdminAccount[]>('/api/platform/admins');
  }

  createAdmin(body: CreatePlatformAdminRequest): Observable<PlatformAdminAccount> {
    return this.http.post<PlatformAdminAccount>('/api/platform/admins', body);
  }
}
