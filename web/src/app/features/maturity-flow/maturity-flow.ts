import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TodayDataSource } from '../../core/data/today-data-source';
import { APP_CONFIG } from '../../core/config/app-config';
import { BusinessClock } from '../../core/time/business-clock';
import { Idea, Lead, QuoteRequestReceipt } from '../../core/models/today.models';
import { ConcentrationBar } from '../today/shared/concentration-bar';
import { EliDatePipe, UsdPipe } from '../today/shared/format';

@Component({
  selector: 'eli-maturity-flow',
  imports: [FormsModule, MatButtonModule, RouterLink, ConcentrationBar, EliDatePipe, UsdPipe],
  templateUrl: './maturity-flow.html',
  styleUrl: './maturity-flow.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaturityFlow {
  private readonly source = inject(TodayDataSource);
  protected readonly config = inject(APP_CONFIG);
  protected readonly clock = inject(BusinessClock);
  protected readonly steps = ['Opportunity', 'Context & evidence', 'Ideas & pricing', 'Handoff', 'Follow-up'];
  protected readonly step = signal(0);
  protected readonly clientId = signal<string | undefined>(undefined);
  protected readonly selected = signal<readonly Idea[]>([]);
  protected readonly recipient = signal('');
  protected readonly note = signal('');
  protected readonly prepared = signal(false);
  protected readonly quoteBusy = signal<string | null>(null);
  protected readonly quoteError = signal('');
  protected readonly receipt = signal<QuoteRequestReceipt | null>(null);
  protected readonly confirmIdea = signal<Idea | null>(null);
  protected readonly brief = rxResource({ stream: () => this.source.getMorningBrief('team') });
  protected readonly leads = computed(() => this.brief.hasValue() ? this.brief.value().leads.filter(l => l.moment.type === 'maturity') : []);
  protected readonly lead = computed(() => this.leads().find(l => l.clientId === this.clientId()));
  protected readonly client = rxResource({ params: () => this.clientId(), stream: ({ params }) => this.source.getClientContext(params) });
  protected readonly ideas = rxResource({ params: () => this.clientId(), stream: ({ params }) => this.source.getIdeas(params) });
  protected readonly canPrepare = computed(() => this.recipient().trim().length > 0 && this.selected().length > 0 && this.client.hasValue() && !this.client.isLoading() && !this.ideas.isLoading());
  // Session-only draft: no delivery, acknowledgment or trade attribution is inferred.
  protected pick(lead: Lead): void {
    if (this.quoteBusy()) return;
    this.clientId.set(lead.clientId); this.selected.set([]); this.recipient.set(''); this.note.set('');
    this.prepared.set(false); this.receipt.set(null); this.confirmIdea.set(null); this.quoteError.set(''); this.step.set(1);
  }
  protected toggle(idea: Idea): void {
    if (this.prepared()) return;
    this.selected.update(list => list.some(i => i.id === idea.id) ? list.filter(i => i.id !== idea.id) : list.length < 3 ? [...list, idea] : list);
  }
  protected has(idea: Idea): boolean { return this.selected().some(i => i.id === idea.id); }
  protected exceeds(idea: Idea): boolean { return idea.concentration.toPct > idea.concentration.limitPct; }
  protected stale(idea: Idea): boolean { return idea.pricedAt.slice(0, 10) !== this.clock.today(); }
  protected priceTime(idea: Idea): string { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(idea.pricedAt)) + ' HKT'; }
  protected met(lead: Lead): number { return lead.signals.filter(s => s.met).length; }
  protected prepare(): void { if (this.canPrepare()) this.prepared.set(true); }
  protected revise(): void { this.prepared.set(false); }
  private readonly untilDestroyed = takeUntilDestroyed<QuoteRequestReceipt>();
  protected request(): void {
    const idea = this.confirmIdea(); const client = this.clientId();
    if (!idea || !client || this.quoteBusy()) return;
    this.confirmIdea.set(null); this.quoteBusy.set(idea.id); this.quoteError.set('');
    this.source.requestLiveQuote(client, idea.id).pipe(this.untilDestroyed).subscribe({
      next: receipt => { this.receipt.set(receipt); this.quoteBusy.set(null); },
      error: () => { this.quoteError.set('No receipt received. Check the desk request log before retrying to avoid a duplicate request.'); this.quoteBusy.set(null); },
    });
  }
}
