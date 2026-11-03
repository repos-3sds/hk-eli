import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { IdeaFinderDataSource } from './idea-finder-data-source';
import { IdeaQuery, IdeaResults, ReadIntent } from './idea-finder.models';

@Injectable()
export class GatewayIdeaFinderDataSource extends IdeaFinderDataSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  read(text: string): Observable<ReadIntent> {
    return this.http.post<ReadIntent>(`${this.config.gatewayBaseUrl}/ideas/read`, { text }).pipe(timeout(this.config.requestTimeoutMs));
  }

  search(query: IdeaQuery): Observable<IdeaResults> {
    return this.http.post<IdeaResults>(`${this.config.gatewayBaseUrl}/ideas/search`, query).pipe(timeout(this.config.requestTimeoutMs));
  }
}
