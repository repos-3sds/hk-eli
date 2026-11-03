import { Observable } from 'rxjs';
import {
  BookScope,
  ClientContext,
  EvidenceRow,
  MomentStrip,
  MorningBrief,
  QuoteRequestReceipt,
  RolloverIdeas,
} from '../models/today.models';

/**
 * The one door the Today tab uses for data. The mock (fixtures in the browser) and the
 * gateway (Stork AI services behind the API gateway) both implement it, chosen by config.
 */
export abstract class TodayDataSource {
  abstract getMomentStrip(scope: BookScope): Observable<MomentStrip>;
  abstract getMorningBrief(scope: BookScope): Observable<MorningBrief>;
  abstract getClientContext(clientId: string): Observable<ClientContext>;
  abstract getIdeas(clientId: string): Observable<RolloverIdeas>;
  abstract getEvidenceRows(reference: string): Observable<readonly EvidenceRow[]>;
  /** Sends a live-quote request to the desk. Only called after the RM confirms. */
  abstract requestLiveQuote(clientId: string, ideaId: string): Observable<QuoteRequestReceipt>;
  /** Records "Not today" so the lead's outcome capture knows it was seen and parked. */
  abstract recordNotToday(leadId: string): Observable<void>;
}
