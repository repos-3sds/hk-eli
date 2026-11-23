import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatStore } from './chat.store';

const LINE_PX = 22; // the input's line-height
const MAX_PX = 6 * LINE_PX;

/**
 * The ask box at the foot of Chat: one line high, grows with the question (Shift+Enter or long text) up to six lines, answers come from the 12 HK_ELI views via the agent,
 * sends on Enter, stops on Esc, and brings back the last question on the up arrow.
 */
@Component({
  selector: 'eli-chat-composer',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
})
export class ChatComposer {
  protected readonly store = inject(ChatStore);
  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');

  constructor() {
    // Also refit when the draft changes from outside the box: sent (cleared), a follow-up chip, the up arrow.
    afterRenderEffect({ write: () => {
      this.store.draft();
      this.fit();
      queueMicrotask(() => this.fit()); // ngModel writes the new value to the box a tick later
    } });
  }

  /** Height to the text: one line when empty (a long placeholder never makes it taller), at most MAX_PX, then it scrolls. */
  protected fit(): void {
    const el = this.input().nativeElement;
    el.style.height = `${LINE_PX}px`;
    const h = el.value ? Math.min(el.scrollHeight, MAX_PX) : LINE_PX;
    el.style.height = `${h}px`;
    el.style.overflowY = el.value && el.scrollHeight > MAX_PX ? 'auto' : 'hidden';
  }

  focus(): void {
    queueMicrotask(() => this.input().nativeElement.focus());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.store.send(this.store.draft());
    } else if (event.key === 'ArrowUp' && !this.store.draft() && this.store.lastQuestion()) {
      event.preventDefault();
      this.store.draft.set(this.store.lastQuestion()!);
    } else if (event.key === 'Escape' && this.store.busy()) {
      this.store.stop();
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.store.busy()) {
      this.store.stop();
    } else {
      this.store.send(this.store.draft());
    }
  }
}
