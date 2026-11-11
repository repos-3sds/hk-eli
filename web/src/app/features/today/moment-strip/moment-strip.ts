import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GLOSSARY, TermKey } from '../../../core/help/help-content';
import { MatIconModule } from '@angular/material/icon';
import { ScopeSwitch } from '../shared/scope-switch';
import { MOMENT_LABELS, MOMENT_TYPES, Moment, MomentType } from '../../../core/models/today.models';
import { MomentChip } from '../shared/moment-chip';
import { EliDatePipe, OffsetPipe } from '../shared/format';
import { TodayStore } from '../today.store';

const CHIPS_PER_DAY = 3;

/** The next 10 business days of maturities, likely knock-outs, deliveries, idle clients and open RFQs. */
@Component({
  selector: 'eli-moment-strip',
  imports: [MatIconModule, ScopeSwitch, MomentChip, EliDatePipe, OffsetPipe, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './moment-strip.html',
  styleUrl: './moment-strip.scss',
})
export class MomentStrip {
  protected readonly store = inject(TodayStore);
  /** A client chip was pressed. */
  readonly clientPicked = output<Moment>();

  protected readonly types = MOMENT_TYPES;
  protected readonly typeLabels = MOMENT_LABELS;
  protected readonly defs = GLOSSARY;
  protected readonly termOf: Record<MomentType, TermKey> = { maturity: 'maturing', knockout: 'ko', exercised: 'exercised', idle: 'idle', rfq: 'rfq' };
  protected readonly expandedDays = signal<ReadonlySet<number>>(new Set());
  protected readonly skeletonDays = Array.from({ length: 10 }, (_, i) => i);

  protected readonly columns = computed(() => {
    if (!this.store.strip.hasValue()) {
      return [];
    }
    const { days, moments } = this.store.strip.value();
    const types = this.store.activeTypes();
    const dockClient = this.store.dockClientId();
    return days.map((day) => {
      const all = moments.filter((m) => m.offset === day.offset && types.has(m.type));
      const expanded = this.expandedDays().has(day.offset);
      const shown = expanded || all.length <= CHIPS_PER_DAY ? all : all.slice(0, CHIPS_PER_DAY - 1);
      return {
        day,
        shown,
        more: all.length - shown.length,
        holdsDockClient: all.some((m) => m.clientId === dockClient),
      };
    });
  });

  protected expand(offset: number): void {
    this.expandedDays.update((s) => new Set(s).add(offset));
  }

  protected pick(moment: Moment): void {
    this.store.pickClient(moment.clientId);
    this.clientPicked.emit(moment);
  }

  protected isActive(type: MomentType): boolean {
    return this.store.activeTypes().has(type);
  }

  protected chipLabel(m: Moment): string {
    return `${m.clientShortName}, ${MOMENT_LABELS[m.type]}`;
  }
}
