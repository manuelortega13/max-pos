import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateCreditorPaymentRequest, CreditorPayment } from '../models';

/**
 * Thin HTTP layer for creditor payments. State isn't held in the
 * service since payments are tied to a specific creditor — pages
 * that need the history fetch fresh on mount via
 * {@link listByCreditor} rather than caching across navigations.
 */
@Injectable({ providedIn: 'root' })
export class CreditorPaymentService {
  private readonly http = inject(HttpClient);

  create(req: CreateCreditorPaymentRequest): Observable<CreditorPayment> {
    return this.http.post<CreditorPayment>('/api/creditor-payments', req);
  }

  listByCreditor(creditorId: string): Observable<CreditorPayment[]> {
    return this.http.get<CreditorPayment[]>(`/api/creditors/${creditorId}/payments`);
  }

  /** Calling cashier's own payments — used by My Transactions. */
  listMine(): Observable<CreditorPayment[]> {
    return this.http.get<CreditorPayment[]>('/api/creditor-payments/mine');
  }

  /** All payments (admin-only) — used by the End-of-Day live preview
   *  to bucket today's cash credit payments into the till math. */
  listAll(): Observable<CreditorPayment[]> {
    return this.http.get<CreditorPayment[]>('/api/creditor-payments');
  }

  /** Admin-only on the backend — UI gates the trigger so cashiers
   *  never see the button. Optional `reason` is appended to notes. */
  void(paymentId: string, reason?: string | null): Observable<CreditorPayment> {
    return this.http.post<CreditorPayment>(
      `/api/creditor-payments/${paymentId}/void`,
      { reason: reason ?? null },
    );
  }
}
