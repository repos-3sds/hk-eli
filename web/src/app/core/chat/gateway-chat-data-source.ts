import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ChatDataSource } from './chat-data-source';
import { ChatAnswer, ChatQuestion } from './chat.models';

/** Posts the question to the HK ELI chat service behind the API gateway (Stork AI orchestrator, Gemini adapter). */
@Injectable()
export class GatewayChatDataSource extends ChatDataSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  ask(question: ChatQuestion): Observable<ChatAnswer> {
    return this.http
      .post<ChatAnswer>(`${this.config.gatewayBaseUrl}/chat/answers`, question)
      .pipe(timeout(this.config.requestTimeoutMs * 3));
  }
}
