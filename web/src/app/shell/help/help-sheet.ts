import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { CAN_ANSWER } from '../../core/chat/chat-scope';
import { ASK_EXAMPLES, GLOSSARY, ROLE_GUIDES } from '../../core/help/help-content';
import { SessionService } from '../../core/session/session.service';
import { FirstRunStore } from './first-run.store';

export type HelpTab = 'start' | 'ask' | 'glossary';

/** Help: the role's three steps, what Chat can answer (each one asks it), and the glossary with a filter. */
@Component({
  selector: 'eli-help-sheet',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h2 mat-dialog-title class="title">Help</h2>
      <button type="button" class="x" aria-label="Close" (click)="ref.close()"><mat-icon svgIcon="x" /></button>
    </header>
    <div class="tabs" role="tablist" aria-label="Help sections">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" class="tab" [class.on]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
      }
    </div>
    <mat-dialog-content class="body" role="tabpanel">
      @switch (tab()) {
        @case ('start') {
          <p class="lede">As a {{ session.roleLabel() }}, start here.</p>
          <ol class="steps">
            @for (s of steps(); track s.title; let i = $index) {
              <li><span class="n">{{ i + 1 }}</span><div><span class="t">{{ s.title }}</span><span class="d">{{ s.text }}</span>
                <button type="button" class="eli-link" (click)="go(s.path)">{{ s.cta }}</button></div></li>
            }
          </ol>
          <button matButton="outlined" type="button" (click)="showGuide()">Show the guide on the page again</button>
          <h3 class="sub">Good to know</h3>
          <ul class="notes">
            <li>Positions refresh overnight and indicative prices each morning. The two clocks on each tab say how fresh the figures are.</li>
            <li>Internal use only. Nothing here goes to clients. Suitability and advice stay with the owning RM.</li>
            <li>Figures are computed from data. AI only words Chat answers, and never forecasts or advises.</li>
            <li>Words with a dotted underline have a definition. Hover or focus them.</li>
          </ul>
        }
        @case ('ask') {
          <p class="lede">Chat answers from data, not from memory. It can answer {{ canAnswer }}.</p>
          <ul class="asks">
            @for (q of examples; track q.question) {
              <li><span class="topic">{{ q.topic }}</span><button type="button" class="ask" (click)="ask(q.question)">"{{ q.question }}"<mat-icon svgIcon="chevron-right" aria-hidden="true" /></button></li>
            }
          </ul>
          <h3 class="sub">What it will not do</h3>
          <p class="d">Forecast prices, or say what a client should buy or sell. Ask one of those and it says so, then shows what the data can.</p>
        }
        @case ('glossary') {
          <label class="filter"><span class="eli-visually-hidden">Filter terms</span>
            <input type="search" placeholder="Filter terms, for example strike" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <dl class="gloss">
            @for (g of terms(); track g.term) {
              <div class="gi"><dt>{{ g.term }}</dt><dd>{{ g.definition }}</dd></div>
            } @empty {
              <p class="d">No term matches "{{ q() }}".</p>
            }
          </dl>
        }
      }
    </mat-dialog-content>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; background: var(--eli-bg-surface); color: var(--eli-text-primary); }
    mat-icon { flex: none; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: var(--eli-space-7) var(--eli-space-8) var(--eli-space-3); }
    .title { margin: 0; padding: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-xl); font-weight: var(--eli-weight-semibold); }
    .title::before { display: none; }
    .x { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted-2); cursor: pointer;
      &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); } mat-icon { width: 16px; height: 16px; } }
    .tabs { display: flex; gap: var(--eli-space-2); padding: 0 var(--eli-space-8); border-bottom: 1px solid var(--eli-separator); }
    .tab { padding: var(--eli-space-4) var(--eli-space-5); border: 0; border-bottom: 2px solid transparent; background: none; color: var(--eli-text-muted-2); font: inherit; cursor: pointer;
      &.on { border-bottom-color: var(--eli-accent-orange); color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); } &:hover { color: var(--eli-text-strong); } }
    .body { display: flex; flex-direction: column; gap: var(--eli-space-6); padding: var(--eli-space-7) var(--eli-space-8) !important; max-height: none !important; flex: 1; }
    .lede { margin: 0; color: var(--eli-text-strong); }
    .sub { margin: var(--eli-space-4) 0 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-m); font-weight: var(--eli-weight-semibold); }
    .sub::before { display: none; }
    .steps { display: flex; flex-direction: column; gap: var(--eli-space-6); margin: 0; padding: 0; list-style: none;
      li { display: flex; gap: var(--eli-space-5); } div { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; } }
    .n { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--eli-bg-selected); color: var(--eli-text-strong); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); }
    .t { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .d { margin: 0; color: var(--eli-text-muted-card, var(--eli-text-muted)); font-size: var(--eli-font-size-s); }
    .notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: var(--eli-space-3); font-size: var(--eli-font-size-s); }
    .asks { display: flex; flex-direction: column; gap: var(--eli-space-3); margin: 0; padding: 0; list-style: none;
      li { display: grid; grid-template-columns: 110px minmax(0, 1fr); align-items: center; gap: var(--eli-space-4); } }
    .topic { color: var(--eli-text-muted-card, var(--eli-text-muted)); font-size: var(--eli-font-size-s); }
    .ask { display: flex; align-items: center; justify-content: space-between; gap: var(--eli-space-3); padding: var(--eli-space-4) var(--eli-space-5); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-dock); color: var(--eli-text-strong); font: inherit; text-align: left; cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); } mat-icon { width: 14px; height: 14px; color: var(--eli-accent-link); } }
    .filter input { width: 100%; height: 32px; padding: 0 var(--eli-space-5); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-dock); color: var(--eli-text-strong); font: inherit; box-sizing: border-box; }
    .gloss { display: flex; flex-direction: column; gap: var(--eli-space-5); margin: 0; }
    .gi dt { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .gi dd { margin: 2px 0 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-s); }
  `,
})
export class HelpSheet {
  protected readonly ref = inject(MatDialogRef<HelpSheet>);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly firstRun = inject(FirstRunStore);
  protected readonly tab = signal<HelpTab>(inject<{ tab: HelpTab }>(MAT_DIALOG_DATA)?.tab ?? 'start');
  protected readonly tabs: readonly { id: HelpTab; label: string }[] = [
    { id: 'start', label: 'Getting started' },
    { id: 'ask', label: 'What can I ask?' },
    { id: 'glossary', label: 'Glossary' },
  ];
  protected readonly canAnswer = CAN_ANSWER;
  protected readonly examples = ASK_EXAMPLES;
  protected readonly steps = computed(() => ROLE_GUIDES[this.session.role()]);
  protected readonly q = signal('');
  protected readonly terms = computed(() => {
    const q = this.q().trim().toLowerCase();
    const all = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
    return q ? all.filter((g) => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)) : all;
  });

  protected go(path: string): void {
    this.ref.close();
    void this.router.navigateByUrl(path);
  }

  protected ask(question: string): void {
    this.ref.close();
    void this.router.navigate(['/chat'], { queryParams: { q: question } });
  }

  protected showGuide(): void {
    this.firstRun.reopen();
    this.ref.close();
  }
}
