import { Observable, of } from 'rxjs';
import { ChatAnswer, ChatQuestion } from './chat.models';

/** One question and its headline as stored server-side (SQLite behind the pipeline). */
export interface StoredTurn {
  readonly turnId: string;
  readonly conversationId: string;
  readonly askedAt: string;
  readonly question: string;
  readonly status: string;
  readonly headline: string;
}

/** The one door the Chat tab uses. The gateway sends questions to Stork AI; the mock answers from the Today data. */
export abstract class ChatDataSource {
  abstract ask(question: ChatQuestion): Observable<ChatAnswer>;

  /** Past questions kept by the server, newest first. Sources without a store keep history in the session only. */
  storedHistory(): Observable<readonly StoredTurn[] | null> {
    return of(null);
  }

  /** Records a rating against a stored answer. A no-op where answers are not stored. */
  sendFeedback(_turnId: string, _rating: 1 | -1): Observable<unknown> {
    return of(null);
  }
}
