import { Observable } from 'rxjs';
import { ChatAnswer, ChatQuestion } from './chat.models';

/** The one door the Chat tab uses. The gateway sends questions to Stork AI; the mock answers from the Today data. */
export abstract class ChatDataSource {
  abstract ask(question: ChatQuestion): Observable<ChatAnswer>;
}
