import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { ChatStore } from './chat.store';

/**
 * The ask box at the foot of Chat: grows with the question, carries the client the question is about
 * (or "Whole book"), sends on Enter, stops on Esc, and brings back the last question on the up arrow.
 */
@Component({
  selector: 'eli-chat-composer',
  imports: [FormsModule, MatIconModule, MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
})
export class ChatComposer {
  protected readonly store = inject(ChatStore);
  protected readonly clients = FIXTURE_CLIENTS;
  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');

  focus(): void {
    queueMicrotask(() => this.input().nativeElement.focus());
  }

  protected pickClient(id: string | null): void {
    this.store.clientId.set(id);
    this.focus();
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
