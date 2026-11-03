import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import {
  BookScope,
  ClientContext,
  EvidenceRow,
  MomentStrip,
  MorningBrief,
  QuoteRequestReceipt,
  RolloverIdeas,
} from '../models/today.models';
import { TodayDataSource } from './today-data-source';

/**
 * Calls the HK ELI services through the API gateway (Stork AI orchestrator behind it).
 * Every call has a timeout from config; a failure surfaces to the screen, never a silent fallback.
 * The trace header is added by the trace interceptor.
 */
@Injectable()
export class GatewayTodayDataSource extends TodayDataSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private url(path: string): string {
    return `${this.config.gatewayBaseUrl}${path}`;
  }

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params }).pipe(timeout(this.config.requestTimeoutMs));
  }

  getMomentStrip(scope: BookScope): Observable<MomentStrip> {
    return this.get('/today/moments', new HttpParams().set('scope', scope));
  }

  getMorningBrief(scope: BookScope): Observable<MorningBrief> {
    return this.get('/today/brief', new HttpParams().set('scope', scope));
  }

  getClientContext(clientId: string): Observable<ClientContext> {
    return this.get(`/clients/${encodeURIComponent(clientId)}/context`);
  }

  getIdeas(clientId: string): Observable<RolloverIdeas> {
    return this.get(`/clients/${encodeURIComponent(clientId)}/ideas`);
  }

  getEvidenceRows(reference: string): Observable<readonly EvidenceRow[]> {
    return this.get('/evidence', new HttpParams().set('ref', reference));
  }

  requestLiveQuote(clientId: string, ideaId: string): Observable<QuoteRequestReceipt> {
    return this.http
      .post<QuoteRequestReceipt>(this.url('/quotes/requests'), { clientId, ideaId })
      .pipe(timeout(this.config.requestTimeoutMs));
  }

  recordNotToday(leadId: string): Observable<void> {
    return this.http
      .post<void>(this.url(`/leads/${encodeURIComponent(leadId)}/not-today`), {})
      .pipe(timeout(this.config.requestTimeoutMs));
  }
}
