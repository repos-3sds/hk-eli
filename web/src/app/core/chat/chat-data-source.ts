import { Observable, of, map } from 'rxjs';
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

/** One event while an answer is worked out: a pipeline step finished, or the answer itself. */
export type AskEvent = { readonly kind: 'stage'; readonly label: string } | { readonly kind: 'answer'; readonly answer: ChatAnswer };

/** The one door the Chat tab uses. The gateway sends questions to Stork AI; the mock answers from the Today data. */
export abstract class ChatDataSource {
  abstract ask(question: ChatQuestion): Observable<ChatAnswer>;

  /** The answer with live progress. Sources without streaming send only the answer. */
  askStream(question: ChatQuestion): Observable<AskEvent> {
    return this.ask(question).pipe(map((answer): AskEvent => ({ kind: 'answer', answer })));
  }

  /** Whether askStream reports real pipeline steps (otherwise the screen shows timed steps). */
  readonly streams: boolean = false;

  /** Past questions kept by the server, newest first. Sources without a store keep history in the session only. */
  storedHistory(): Observable<readonly StoredTurn[] | null> {
    return of(null);
  }

  /** Records a rating against a stored answer. A no-op where answers are not stored. */
  sendFeedback(_turnId: string, _rating: 1 | -1): Observable<unknown> {
    return of(null);
  }
}
