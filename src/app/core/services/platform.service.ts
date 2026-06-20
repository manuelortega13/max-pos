import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreatePlanRequest,
  CreatePlatformAdminRequest,
  ImpersonationResponse,
  Plan,
  PlatformAdminAccount,
  PlatformAuditEntry,
  PlatformStore,
  StoreUser,
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

  listStoreUsers(id: string): Observable<StoreUser[]> {
    return this.http.get<StoreUser[]>(`/api/platform/stores/${id}/users`);
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

  assignPlan(id: string, planId: string | null): Observable<PlatformStore> {
    return this.http.put<PlatformStore>(`/api/platform/stores/${id}/plan`, { planId });
  }

  impersonate(id: string): Observable<ImpersonationResponse> {
    return this.http.post<ImpersonationResponse>(`/api/platform/stores/${id}/impersonate`, {});
  }

  listPlans(): Observable<Plan[]> {
    return this.http.get<Plan[]>('/api/platform/plans');
  }

  createPlan(body: CreatePlanRequest): Observable<Plan> {
    return this.http.post<Plan>('/api/platform/plans', body);
  }

  listAdmins(): Observable<PlatformAdminAccount[]> {
    return this.http.get<PlatformAdminAccount[]>('/api/platform/admins');
  }

  createAdmin(body: CreatePlatformAdminRequest): Observable<PlatformAdminAccount> {
    return this.http.post<PlatformAdminAccount>('/api/platform/admins', body);
  }

  setAdminActive(id: string, active: boolean): Observable<PlatformAdminAccount> {
    return this.http.put<PlatformAdminAccount>(`/api/platform/admins/${id}/status`, { active });
  }

  listActivity(limit = 100): Observable<PlatformAuditEntry[]> {
    return this.http.get<PlatformAuditEntry[]>('/api/platform/audit', {
      params: { limit: String(limit) },
    });
  }
}
