import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LIBRARY_FOCUS, LibraryPrompt, libraryFor } from '../../core/chat/prompt-library';
import { SessionService } from '../../core/session/session.service';

export type LibraryChoice = { readonly action: 'ask' | 'edit'; readonly question: string };

/** The Prompt Library: every question, by category from the discovery docs, with search. Ask it now or edit it first. */
@Component({
  selector: 'eli-prompt-library',
  imports: [FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h2 class="title"><mat-icon svgIcon="list-checks" aria-hidden="true" />Prompt library</h2>
      <span class="count">For {{ session.roleLabel() }} · {{ total() }} questions</span>
      <button type="button" class="x" aria-label="Close" (click)="ref.close()"><mat-icon svgIcon="x" /></button>
    </header>
    <p class="focus">{{ focus() }}. Grouped by the discovery docs' intents; switch role in the header to see another persona's library.</p>
    <div class="search">
      <mat-icon svgIcon="funnel" aria-hidden="true" />
      <input type="search" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search questions, views or topics" aria-label="Search the prompt library" cdkFocusInitial />
    </div>
    <nav class="cats" aria-label="Categories">
      <button type="button" [class.on]="cat() === null" (click)="cat.set(null)">All</button>
      @for (c of library(); track c.id) {
        <button type="button" [class.on]="cat() === c.id" (click)="cat.set(c.id)">{{ c.title }}</button>
      }
    </nav>
    <div class="body">
      @for (c of shown(); track c.id) {
        <section>
          <h3 class="c-title"><mat-icon [svgIcon]="c.icon" aria-hidden="true" />{{ c.title }}<span class="intents">{{ c.intents.join(' · ') }}</span></h3>
          <ul>
            @for (p of c.prompts; track p.question) {
              <li [class.off]="p.unavailable">
                <button type="button" class="ask" [disabled]="!!p.unavailable" (click)="choose('ask', p)">
                  <span class="q">{{ p.question }}</span>
                  <span class="gives">{{ p.unavailable ?? p.gives }}</span>
                </button>
                <span class="view" [title]="'Answered from the ' + p.view + ' Tableau view'">{{ p.view }}</span>
                @if (!p.unavailable) {
                  <button type="button" class="edit" aria-label="Edit before asking" title="Edit before asking" (click)="choose('edit', p)"><mat-icon svgIcon="square-pen" /></button>
                }
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="empty">No question matches "{{ q() }}". Try a stock, a branch or a word like "maturity".</p>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; max-height: 80vh; width: min(860px, 92vw); background: var(--eli-bg-dock); color: var(--eli-text-primary); }
    .head { display: flex; align-items: center; gap: var(--eli-space-6); padding: var(--eli-space-7) var(--eli-space-8) var(--eli-space-4); }
    .title { display: flex; align-items: center; gap: var(--eli-space-4); margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-xl); font-weight: var(--eli-weight-semibold); mat-icon { color: var(--eli-accent-orange); } }
    .count { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .x { margin-left: auto; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted); cursor: pointer; &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); } mat-icon { width: 16px; height: 16px; } }
    .focus { margin: 0 var(--eli-space-8) var(--eli-space-5); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); }
    .search { display: flex; align-items: center; gap: var(--eli-space-4); margin: 0 var(--eli-space-8); padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-m); background: var(--eli-bg-input);
      &:focus-within { border-color: var(--eli-focus-ring); } mat-icon { width: 15px; height: 15px; color: var(--eli-text-muted); }
      input { flex: 1; height: 38px; border: 0; outline: 0; background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-m); } }
    .cats { display: flex; flex-wrap: wrap; gap: var(--eli-space-3); padding: var(--eli-space-5) var(--eli-space-8); border-bottom: 1px solid var(--eli-separator);
      button { height: 26px; padding: 0 var(--eli-space-5); border: 1px solid var(--eli-border); border-radius: 13px; background: none; color: var(--eli-text-muted-2); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer;
        &.on { border-color: var(--eli-accent-link); background: rgb(99 171 255 / 14%); color: var(--eli-text-strong); } } }
    .body { overflow: auto; padding: var(--eli-space-4) var(--eli-space-8) var(--eli-space-8); }
    .c-title { display: flex; align-items: center; gap: var(--eli-space-4); margin: var(--eli-space-7) 0 var(--eli-space-3); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase;
      mat-icon { width: 14px; height: 14px; color: var(--eli-accent-orange); } .intents { margin-left: auto; color: var(--eli-text-muted); font-family: ui-monospace, Menlo, monospace; letter-spacing: 0; text-transform: none; font-weight: 400; } }
    ul { margin: 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: minmax(0, 1fr) auto 30px; gap: var(--eli-space-5); align-items: center; border-bottom: 1px solid var(--eli-separator); }
    .ask { display: flex; flex-direction: column; gap: 2px; padding: var(--eli-space-5) var(--eli-space-3); border: 0; background: none; text-align: left; font: inherit; cursor: pointer; color: inherit;
      &:hover .q { color: var(--eli-accent-link); } &:disabled { cursor: default; } }
    .q { color: var(--eli-text-strong); font-size: var(--eli-font-size-m); }
    .gives { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    li.off .q { color: var(--eli-text-muted); }
    li.off .gives { color: var(--eli-accent-orange); }
    .view { color: var(--eli-text-muted); font-family: ui-monospace, Menlo, monospace; font-size: var(--eli-font-size-xs); }
    .edit { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted); cursor: pointer; &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); } mat-icon { width: 14px; height: 14px; } }
    .empty { color: var(--eli-text-muted); }
  `,
})
export class PromptLibraryDialog {
  protected readonly ref = inject<MatDialogRef<PromptLibraryDialog, LibraryChoice>>(MatDialogRef);
  protected readonly data = inject<{ category?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  protected readonly session = inject(SessionService);
  protected readonly library = computed(() => libraryFor(this.session.role()));
  protected readonly focus = computed(() => LIBRARY_FOCUS[this.session.role()]);
  protected readonly q = signal('');
  protected readonly cat = signal<string | null>(this.data?.category ?? null);
  protected readonly total = computed(() => this.library().reduce((s, c) => s + c.prompts.length, 0));

  protected readonly shown = computed(() => {
    const words = this.q().toLowerCase().split(/\s+/).filter(Boolean);
    return this.library().filter((c) => this.cat() === null || c.id === this.cat())
      .map((c) => ({
        ...c,
        prompts: c.prompts.filter((p) => {
          const hay = `${p.question} ${p.gives} ${p.view} ${c.title} ${c.intents.join(' ')}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((c) => c.prompts.length > 0);
  });

  protected choose(action: 'ask' | 'edit', p: LibraryPrompt): void {
    this.ref.close({ action, question: p.question });
  }
}
