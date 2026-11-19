import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ROLE_GUIDES } from '../../core/help/help-content';
import { SessionService } from '../../core/session/session.service';
import { FirstRunStore } from './first-run.store';
import { HelpOpener } from './help-opener';

/** The first-run guide: three steps for the signed-in role, shown until dismissed. Reopen it from Help. */
@Component({
  selector: 'eli-first-run',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="guide" aria-labelledby="fr-h">
      <div class="head">
        <h2 id="fr-h" class="h">New here, {{ session.user().firstName }}? Three steps for a {{ session.roleLabel() }}</h2>
        <button type="button" class="eli-link" (click)="help.open('ask')">What can I ask?</button>
        <button type="button" class="eli-link" (click)="help.open('glossary')">Glossary</button>
        <button type="button" class="x" aria-label="Hide the guide. Reopen it from Help." (click)="store.dismiss()"><mat-icon svgIcon="x" /></button>
      </div>
      <ol class="steps">
        @for (s of steps(); track s.title; let i = $index) {
          <li class="step">
            <span class="n" aria-hidden="true">{{ i + 1 }}</span>
            <div class="txt"><span class="t">{{ s.title }}</span><span class="d">{{ s.text }}</span></div>
            <button matButton type="button" class="go" (click)="go(s.path)">{{ s.cta }}<mat-icon svgIcon="chevron-right" iconPositionEnd /></button>
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    :host { display: block; flex: none; padding: var(--eli-space-5) var(--eli-space-8) 0; }
    .guide { padding: var(--eli-space-5) var(--eli-space-6); border: 1px solid var(--eli-border); border-left: 3px solid var(--eli-accent-link); border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); }
    .head { display: flex; align-items: center; gap: var(--eli-space-6); }
    .h { flex: 1; margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-m); font-weight: var(--eli-weight-semibold); }
    .h::before { display: none; }
    .x { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted-2); cursor: pointer;
      &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); } mat-icon { width: 14px; height: 14px; } }
    .steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--eli-space-6); margin: var(--eli-space-4) 0 0; padding: 0; list-style: none; }
    .step { display: grid; grid-template-columns: 22px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: var(--eli-space-4); align-items: start; }
    .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--eli-bg-selected); color: var(--eli-text-strong); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); }
    .txt { display: flex; flex-direction: column; gap: 2px; }
    .t { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .d { color: var(--eli-text-muted-card, var(--eli-text-muted)); font-size: var(--eli-font-size-s); }
    .go { grid-column: 2; justify-self: start; margin-left: -12px; }
    @container widget (max-width: 1000px) { .steps { grid-template-columns: 1fr; } }
  `,
})
export class FirstRun {
  protected readonly session = inject(SessionService);
  protected readonly store = inject(FirstRunStore);
  protected readonly help = inject(HelpOpener);
  private readonly router = inject(Router);
  protected readonly steps = computed(() => ROLE_GUIDES[this.session.role()]);

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
