import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { SessionService } from '../../core/session/session.service';
import { BusinessClock } from '../../core/time/business-clock';
import { ChatAnswer } from '../../core/chat/chat.models';
import { answerAsText } from '../../core/chat/answer-text';
import { PIPELINE_CAN_ANSWER } from '../../core/chat/discovery-questions';
import { libraryFor } from '../../core/chat/prompt-library';
import { AnswerCard } from './answer-card';
import { ChatComposer } from './chat-composer';
import { ANSWER_STAGES, ChatStore } from './chat.store';

interface Starter {
  readonly icon: string;
  readonly title: string;
  readonly question: string;
}


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

  protected readonly starters = computed<readonly Starter[]>(() =>
    libraryFor(this.session.role())
      .flatMap((c) => c.prompts.filter((p) => !p.unavailable).slice(0, 1).map((p) => ({ icon: c.icon, title: c.title, question: p.question })))
      .slice(0, 4),
  );
  protected readonly stages = ANSWER_STAGES;
  protected readonly pipeline = true;
  protected readonly canAnswer = PIPELINE_CAN_ANSWER;
  /** The RM has scrolled up, away from the newest answer. */
  protected readonly awayFromBottom = signal(false);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly greeting = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.session.user().firstName}`;
  });

  /** From the URL (?q=…), bound by the router. */
  readonly q = input<string | undefined>();
  /** A question from the Prompt Library to edit before asking. */
  readonly draft = input<string | undefined>();

  constructor() {
    // A question handed over from Today: ask it once, then drop it from the URL.
    effect(() => {
      const q = this.q();
      if (!q) {
        return;
      }
      untracked(() => {
        if (this.store.turns().length > 0 && this.store.title() !== q) {
          this.store.newChat();
        }
        this.store.send(q);
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      });
    });
    // A question picked in the Prompt Library to edit first: put it in the ask box.
    effect(() => {
      const d = this.draft();
      if (!d) return;
      untracked(() => {
        this.store.draft.set(d);
        this.composer().focus();
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


  protected async copyQuestion(turnId: string, question: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(question);
    } catch {
      return;
    }
    this.copiedId.set('q' + turnId);
    setTimeout(() => this.copiedId.set(null), 1500);
  }

  /** The Prompt Library is its own tab now (Hawk, 2026-11-20). */
  protected openLibrary(): void {
    void this.router.navigate(['/library']);
  }

  protected editQuestion(turnId: string): void {
    this.store.edit(turnId);
    this.composer().focus();
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
