import { inject, provideAppInitializer, EnvironmentProviders } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Info,
  Lightbulb,
  Link,
  MessageSquare,
  Pin,
  RefreshCw,
  Send,
  Sparkles,
  SquareArrowOutUpRight,
  Sun,
  Undo2,
  X,
} from 'lucide-static';

/** Lucide icons the app uses, drawn through Angular Material's icon component. */
export const LUCIDE_ICONS: Record<string, string> = {
  'arrow-left': ArrowLeft,
  bell: Bell,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'file-text': FileText,
  info: Info,
  lightbulb: Lightbulb,
  link: Link,
  'message-square': MessageSquare,
  pin: Pin,
  'refresh-cw': RefreshCw,
  send: Send,
  sparkles: Sparkles,
  'external-link': SquareArrowOutUpRight,
  sun: Sun,
  undo: Undo2,
  x: X,
};

/** Digimarkets platform icons, exported from the HK ELI Figma shell (fills use currentColor). */
export const PLATFORM_ICONS: Record<string, string> = {
  'dm-workspaces':
    '<svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 2C14.3282 2.00025 15 2.67172 15 3.5V12.5C15 13.3283 14.3282 13.9998 13.5 14H3.5C2.67157 14 2 13.3284 2 12.5V3.5C2 2.67157 2.67157 2 3.5 2H13.5ZM3 12.5C3 12.7761 3.22386 13 3.5 13H10.5283V9.73047H3V12.5ZM3 4.75488V8.73047H10.5283V4.75488H3ZM11.5283 13H13.5C13.7759 12.9998 14 12.776 14 12.5V4.75488H11.5283V13Z" fill="currentColor"/></svg>',
  'dm-widgets':
    '<svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12.3262" cy="11.8262" r="2.5" stroke="currentColor"/><rect x="2.67383" y="9.32617" width="5" height="5" rx="0.5" stroke="currentColor"/><rect x="9.82617" y="2.17383" width="5" height="5" rx="0.5" stroke="currentColor"/><rect x="2.17383" y="1.67383" width="6" height="6" rx="1" fill="currentColor"/></svg>',
  'dm-pages':
    '<svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="11.9995" height="11" rx="1" stroke="currentColor"/><rect x="2.39355" y="2.75391" width="11.9995" height="2" fill="currentColor"/></svg>',
  'dm-plus':
    '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.1 0V8.1H0V9.9H8.1V18H9.9V9.9H18V8.1H9.9V0H8.1Z" fill="currentColor"/></svg>',
  'dm-faq':
    '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0C13.9747 0 18 4.02595 18 9C18 13.9747 13.974 18 9 18C4.02529 18 0 13.974 0 9C0 4.02529 4.02595 0 9 0ZM9 1.40625C4.80259 1.40625 1.40625 4.80315 1.40625 9C1.40625 13.1974 4.80315 16.5938 9 16.5938C13.1974 16.5938 16.5938 13.1968 16.5938 9C16.5938 4.80259 13.1968 1.40625 9 1.40625ZM9 12.2402C9.59647 12.2402 10.0801 12.7238 10.0801 13.3203C10.0799 13.9166 9.59636 14.4004 9 14.4004C8.40364 14.4004 7.92009 13.9166 7.91992 13.3203C7.91992 12.7238 8.40353 12.2402 9 12.2402ZM9.36035 4.32031C10.9482 4.32031 12.24 5.55028 12.2402 7.0625C12.2402 8.33824 11.3209 9.4135 10.0801 9.71875V10.834C10.0801 11.2127 9.75801 11.5205 9.36035 11.5205C8.96275 11.5204 8.64062 11.2127 8.64062 10.834V9.12012C8.64062 8.74143 8.96275 8.43463 9.36035 8.43457C10.1544 8.43457 10.8008 7.81871 10.8008 7.0625C10.8005 6.30649 10.1542 5.69141 9.36035 5.69141C8.56654 5.69147 7.92114 6.30653 7.9209 7.0625C7.9209 7.44122 7.59785 7.74902 7.2002 7.74902C6.80266 7.74888 6.48047 7.44113 6.48047 7.0625C6.48071 5.55032 7.77252 4.32037 9.36035 4.32031Z" fill="currentColor"/></svg>',
  'dm-logout':
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.95996 0C9.66677 0 10.24 0.596787 10.2402 1.33301V3.66699C10.2401 3.85095 10.0966 4 9.91992 4H9.28027C9.10364 4 8.96012 3.85095 8.95996 3.66699V1.33301H1.28027V14.667H8.95996V12.333C8.96013 12.1491 9.10365 12 9.28027 12H9.91992C10.0966 12 10.24 12.1491 10.2402 12.333V14.667C10.2401 15.4032 9.66677 16 8.95996 16H1.28027C0.573452 16 0.000157816 15.4032 0 14.667V1.33301C0.000174263 0.596787 0.573462 0 1.28027 0H8.95996ZM11.7119 3.22949C11.8271 3.17345 11.9629 3.19876 12.0566 3.29102L15.8965 7.10449C15.9627 7.17017 16 7.26318 16 7.36035C15.9999 7.45737 15.9626 7.54963 15.8965 7.61523L12.0566 11.4287C11.9964 11.4882 11.9192 11.5194 11.8408 11.5195C11.7974 11.5195 11.7532 11.5102 11.7119 11.4902C11.5957 11.4351 11.5205 11.3103 11.5205 11.1729V10.4805C11.5205 10.3825 11.5587 10.2883 11.626 10.2227L13.8506 8.05371H4.80078C4.624 8.05371 4.48062 7.89851 4.48047 7.70703V7.01367C4.48047 6.82206 4.6239 6.66699 4.80078 6.66699H13.8506L11.626 4.49805C11.5585 4.43239 11.5205 4.33834 11.5205 4.24023V3.54688C11.5205 3.40944 11.5957 3.28468 11.7119 3.22949Z" fill="currentColor"/></svg>',
  'dm-pin':
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.01783 11.505L5.2466 15.2763L4.43848 15.5457L4.70785 14.7375L8.47909 10.9663L6.32409 8.81131C7.12228 7.94012 8.53023 7.51132 9.55658 7.73381L11.7116 5.57882C11.6869 4.89658 12.2963 3.9614 12.7891 3.42383L16.5603 7.19506C16.0674 7.73293 15.0524 8.27545 14.4053 8.27256L12.2503 10.4276C12.4963 11.5018 11.971 12.7888 11.1728 13.66L9.01783 11.505Z" fill="currentColor"/></svg>',
  'dm-open':
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.432 10V15.432H4.568V4.568H10V3H4.568C4.13244 3 3.76222 3.15555 3.45733 3.46667C3.15244 3.77778 3 4.14489 3 4.568V15.432C3 15.8551 3.15244 16.2222 3.45733 16.5333C3.76222 16.8444 4.13244 17 4.568 17H15.432C15.8551 17 16.2222 16.8444 16.5333 16.5333C16.8444 16.2222 17 15.8551 17 15.432V10H15.432ZM17 3H11.568V4.568H14.3307L6.71467 12.184L7.816 13.2853L15.432 5.66933V8.432H17V3Z" fill="currentColor"/></svg>',
};

export function registerIcons(registry: MatIconRegistry, sanitizer: DomSanitizer): void {
  for (const [name, svg] of Object.entries({ ...LUCIDE_ICONS, ...PLATFORM_ICONS })) {
    // Trusted: the strings are compiled in from the pinned lucide-static package and the Figma export above.
    registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
  }
}

export function provideIcons(): EnvironmentProviders {
  return provideAppInitializer(() => registerIcons(inject(MatIconRegistry), inject(DomSanitizer)));
}
