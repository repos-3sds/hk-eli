import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { APP_CONFIG, MockScenario } from '../config/app-config';
import { FIXTURE_CLIENTS } from '../data/today.fixture';
import { BusinessClock } from '../time/business-clock';
import { IdeaFinderDataSource } from './idea-finder-data-source';
import { IdeaQuery, IdeaResults, ReadIntent } from './idea-finder.models';
import { ALL_TICKERS, rankIdeas, readIntent } from './idea-finder-logic';
import { WAREHOUSE } from './idea-warehouse.fixture';

@Injectable()
export class MockIdeaFinderDataSource extends IdeaFinderDataSource {
  private readonly config = inject(APP_CONFIG);
  private readonly clock = inject(BusinessClock);
  private readonly document = inject(DOCUMENT);

  private get scenario(): MockScenario {
    const fromUrl = new URLSearchParams(this.document.location?.search ?? '').get('scenario');
    return (fromUrl as MockScenario | null) ?? this.config.mockScenario;
  }

  private respond<T>(value: () => T): Observable<T> {
    const latency = this.scenario === 'slow' ? this.config.mockLatencyMs * 6 : this.config.mockLatencyMs / 2;
    if (this.scenario === 'error') {
      return timer(latency).pipe(switchMap(() => throwError(() => new Error('The idea warehouse did not answer in time.'))));
    }
    return of(null).pipe(delay(latency), switchMap(() => of(value())));
  }

  read(text: string): Observable<ReadIntent> {
    return this.respond(() => readIntent(text, ALL_TICKERS, FIXTURE_CLIENTS));
  }

  search(query: IdeaQuery): Observable<IdeaResults> {
    return this.respond(() => {
      const client = FIXTURE_CLIENTS.find((c) => c.id === query.filters.clientId) ?? null;
      const warehouse = this.scenario === 'empty' ? [] : WAREHOUSE;
      const { matches, passed, notionalUsd } = rankIdeas(warehouse, query, client, `${this.clock.businessDate()}T18:00:00+08:00`);
      return { matches, passedFilters: passed, warehouseSize: warehouse.length, notionalUsd, businessDate: this.clock.businessDate() };
    });
  }
}
