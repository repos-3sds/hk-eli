import { Pipe, PipeTransform } from '@angular/core';
import { dayLabel, dayMonth, longDate, offsetLabel, shortDate } from '../../../core/time/business-calendar';

/** USD 1.24m, USD 420k, USD 0 */
export function usdCompact(value: number): string {
  if (value >= 1_000_000) {
    return `USD ${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
  }
  if (value >= 1_000) {
    return `USD ${Math.round(value / 1_000)}k`;
  }
  return `USD ${value}`;
}

@Pipe({ name: 'usd' })
export class UsdPipe implements PipeTransform {
  transform(value: number): string {
    return usdCompact(value);
  }
}

type DateStyle = 'day' | 'short' | 'dayMonth' | 'long';

@Pipe({ name: 'eliDate' })
export class EliDatePipe implements PipeTransform {
  transform(iso: string | null, style: DateStyle = 'short'): string {
    if (!iso) {
      return '—';
    }
    const date = iso.slice(0, 10);
    switch (style) {
      case 'day':
        return dayLabel(date);
      case 'dayMonth':
        return dayMonth(date);
      case 'long':
        return longDate(date);
      default:
        return shortDate(date);
    }
  }
}

@Pipe({ name: 'offset' })
export class OffsetPipe implements PipeTransform {
  transform(offset: number): string {
    return offsetLabel(offset);
  }
}

/** "07:10 HKT" from an ISO timestamp with offset. */
export function clockTime(iso: string): string {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} HKT` : '';
}
