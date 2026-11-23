import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatStore } from './chat.store';

/**
 * The ask box at the foot of Chat: one line high and grows with the question, answers come from the 12 HK_ELI views via the agent,
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
    // Re-fit when the draft changes from outside too (sent and cleared, or brought back with the up arrow).
    afterRenderEffect(() => {
      this.store.draft();
      this.fit();
    });
  }

  /** One line until the text needs more, up to the CSS max-height; then it scrolls inside. */
  protected fit(): void {
    const el = this.input().nativeElement;
    el.style.height = 'auto';
    const max = parseFloat(getComputedStyle(el).maxHeight) || 154;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
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
