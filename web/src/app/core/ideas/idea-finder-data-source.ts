import { Observable } from 'rxjs';
import { IdeaQuery, IdeaResults, ReadIntent } from './idea-finder.models';

/** The one door the Ideas tab uses. Mock: the warehouse fixture in the browser. Gateway: Stork AI and the idea warehouse. */
export abstract class IdeaFinderDataSource {
  /** Turns the RM's plain words into filters (Stork AI in production; a rule reader in the mock). */
  abstract read(text: string): Observable<ReadIntent>;
  abstract search(query: IdeaQuery): Observable<IdeaResults>;
}
