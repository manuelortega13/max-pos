import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Page, TransactionRow } from '../models';

/** Filter + paging inputs for one feed query. "all"/empty values are
 *  simply omitted from the request — the backend treats absent params
 *  as "no filter". */
export interface TransactionFeedQuery {
  readonly search?: string;
  readonly status?: string;
  readonly source?: string;
  readonly cashierId?: string;
  /** Inclusive lower bound (ISO instant). Rows on/after this are kept. */
  readonly from?: string;
  /** Exclusive upper bound (ISO instant). Rows strictly before this are kept. */
  readonly to?: string;
  readonly page: number;
  readonly size: number;
}

/**
 * Read-side client for the unified `/api/transactions` feed (admin Sales
 * page). Unlike the other domain services this holds no signal cache —
 * the page is fetched on demand per filter/page change, which is the
 * whole point of moving paging to the server.
 */
@Injectable({ providedIn: 'root' })
export class TransactionFeedService {
  private readonly http = inject(HttpClient);

  query(q: TransactionFeedQuery): Observable<Page<TransactionRow>> {
    let params = new HttpParams().set('page', q.page).set('size', q.size);
    if (q.search?.trim()) params = params.set('search', q.search.trim());
    if (q.status && q.status !== 'all') params = params.set('status', q.status);
    if (q.source && q.source !== 'all') params = params.set('source', q.source);
    if (q.cashierId && q.cashierId !== 'all') params = params.set('cashierId', q.cashierId);
    if (q.from) params = params.set('from', q.from);
    if (q.to) params = params.set('to', q.to);
    return this.http.get<Page<TransactionRow>>('/api/transactions', { params });
  }
}
