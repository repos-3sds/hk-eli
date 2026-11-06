import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { LaunchRole, SessionService } from '../../core/session/session.service';
import { BusinessClock } from '../../core/time/business-clock';
import { ChatAnswer } from '../../core/chat/chat.models';
import { answerAsText } from '../../core/chat/answer-text';
import { AnswerCard } from './answer-card';
import { ChatComposer } from './chat-composer';
import { ANSWER_STAGES, ChatStore } from './chat.store';

interface Starter {
  readonly icon: string;
  readonly title: string;
  readonly question: string;
}

/** Ready questions for each launch role. Each one is answered from data, never from the model's memory. */
const STARTERS: Record<LaunchRole, readonly Starter[]> = {
  wms: [
    { icon: 'calendar-clock', title: 'Maturities', question: 'Who matures this week?' },
    { icon: 'shield-alert', title: 'Knock-outs', question: 'Which knock-outs are close to the barrier?' },
    { icon: 'user-round', title: 'One client', question: 'Brief me on Chan' },
    { icon: 'history', title: 'Client history', question: 'What did Chan trade in the last 90 days?' },
  ],
  pm: [
    { icon: 'chart-column', title: 'Concentration', question: 'Top concentrations against limit' },
    { icon: 'funnel', title: 'Unmet demand', question: 'What was quoted and not traded this week?' },
    { icon: 'calendar-clock', title: 'Maturities', question: 'Who matures this week?' },
    { icon: 'shield-alert', title: 'Knock-outs', question: 'Which knock-outs are close to the barrier?' },
  ],
  tsm: [
    { icon: 'chart-column', title: 'Rollover', question: 'Where is rollover below 80% this month?' },
    { icon: 'calendar-clock', title: 'Maturities', question: 'Who matures this week?' },
    { icon: 'funnel', title: 'Unmet demand', question: 'What was quoted and not traded this week?' },
    { icon: 'shield-alert', title: 'Knock-outs', question: 'Which knock-outs are close to the barrier?' },
  ],
};

/**
 * The Chat tab: ask about the book in plain words, get typed answers built from data.
 * A question from Today arrives as ?q=…&client=… and is asked once; the URL is then cleaned.
 * Internal use only: nothing is ever sent to a client from here.
 */
@Component({
  selector: 'eli-chat-page',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, AnswerCard, ChatComposer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
})
export class ChatPage {
  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);
  private readonly config = inject(APP_CONFIG);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild.required(ChatComposer);

  protected readonly starters = computed(() => STARTERS[this.session.role()]);
  protected readonly stages = ANSWER_STAGES;
  protected readonly clients = FIXTURE_CLIENTS;
  /** The RM has scrolled up, away from the newest answer. */
  protected readonly awayFromBottom = signal(false);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly greeting = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.session.user().firstName}`;
  });

  /** From the URL (?q=…&client=…), bound by the router. */
  readonly q = input<string | undefined>();
  readonly client = input<string | undefined>();

  constructor() {
    // A question handed over from Today: ask it once, then drop it from the URL.
    effect(() => {
      const q = this.q();
      const client = this.client() ?? null;
      if (!q) {
        return;
      }
      untracked(() => {
        if (this.store.turns().length > 0 && this.store.title() !== q) {
          this.store.newChat();
        }
        this.store.clientId.set(client);
        this.store.send(q, client);
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      });
    });
    // A new question or answer brings the newest turn into view.
    effect(() => {
      this.store.turns();
      queueMicrotask(() => this.toBottom());
    });
  }

  protected time(d: Date): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: this.config.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  }

  protected ask(question: string): void {
    this.store.send(question);
    this.focusInput();
  }

  protected onScroll(): void {
    const el = this.scroller().nativeElement;
    this.awayFromBottom.set(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
  }

  protected toBottom(): void {
    const el = this.scroller().nativeElement;
    el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }

  protected clientName(id: string): string {
    return this.clients.find((c) => c.id === id)?.shortName ?? id;
  }

  protected async copy(turnId: string, answer: ChatAnswer): Promise<void> {
    try {
      await navigator.clipboard.writeText(answerAsText(answer));
      this.copiedId.set(turnId);
      setTimeout(() => this.copiedId.set(null), 1600);
    } catch {
      // Clipboard blocked (for example an unfocused frame): nothing to undo.
    }
  }

  private focusInput(): void {
    this.composer().focus();
  }
}
