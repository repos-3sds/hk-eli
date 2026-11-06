/**
 * Scope (R38): which part of the business a view covers. Launch users see all trades, so the default is the
 * whole business; they narrow to a district, branch, RM, segment, channel or underlying.
 *
 * Two kinds of data answer a scope:
 * - Client-level data (moments, leads, clients) can be cut by every scope.
 * - Aggregates kept by branch, segment and channel (rollover pockets, month-to-date rows) cannot be cut by RM or
 *   underlying. For those scopes they fall back to the whole business and say so, rather than guess.
 */

export type ScopeKind = 'all' | 'district' | 'branch' | 'rm' | 'segment' | 'channel' | 'underlying';

export type BookScope =
  | 'all'
  | `district:${string}`
  | `branch:${string}`
  | `rm:${string}`
  | `segment:${string}`
  | 'channel:digibank'
  | `underlying:${string}`;

export type ScopeGroup = 'Business' | 'District' | 'Branch' | 'RM' | 'Segment' | 'Channel' | 'Underlying';

export interface ScopeOption {
  readonly id: BookScope;
  readonly label: string;
  readonly group: ScopeGroup;
}

/** Demo districts. The real district list comes from the branch master. */
export const DISTRICT_OF_BRANCH: Readonly<Record<string, string>> = {
  Central: 'Hong Kong Island',
  'Kwun Tong': 'Kowloon',
  'Mong Kok': 'Kowloon',
  'Tsim Sha Tsui': 'Kowloon',
};

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  { id: 'all', label: 'Whole business', group: 'Business' },
  { id: 'district:Hong Kong Island', label: 'Hong Kong Island', group: 'District' },
  { id: 'district:Kowloon', label: 'Kowloon', group: 'District' },
  { id: 'branch:Central', label: 'Central', group: 'Branch' },
  { id: 'branch:Kwun Tong', label: 'Kwun Tong', group: 'Branch' },
  { id: 'branch:Mong Kok', label: 'Mong Kok', group: 'Branch' },
  { id: 'branch:Tsim Sha Tsui', label: 'Tsim Sha Tsui', group: 'Branch' },
  { id: 'rm:Jason Yu', label: 'Jason Yu', group: 'RM' },
  { id: 'rm:Mandy Chow', label: 'Mandy Chow', group: 'RM' },
  { id: 'rm:Peter Leung', label: 'Peter Leung', group: 'RM' },
  { id: 'rm:Srivalli T.', label: 'Srivalli T.', group: 'RM' },
  { id: 'segment:Treasures', label: 'Treasures', group: 'Segment' },
  { id: 'segment:Treasure Private', label: 'Treasure Private', group: 'Segment' },
  { id: 'channel:digibank', label: 'Digibank (self-directed)', group: 'Channel' },
  { id: 'underlying:NVDA', label: 'Holds NVDA', group: 'Underlying' },
  { id: 'underlying:AMD', label: 'Holds AMD', group: 'Underlying' },
  { id: 'underlying:TSLA', label: 'Holds TSLA', group: 'Underlying' },
  { id: 'underlying:AAPL', label: 'Holds AAPL', group: 'Underlying' },
];

export function scopeLabel(scope: BookScope): string {
  return SCOPE_OPTIONS.find((o) => o.id === scope)?.label ?? 'Whole business';
}

export function scopeKind(scope: BookScope): ScopeKind {
  return scope === 'all' ? 'all' : (scope.slice(0, scope.indexOf(':')) as ScopeKind);
}

export function scopeValue(scope: BookScope): string {
  return scope === 'all' ? '' : scope.slice(scope.indexOf(':') + 1);
}

export function isBookScope(value: string | null | undefined): value is BookScope {
  return !!value && SCOPE_OPTIONS.some((o) => o.id === value);
}

/** What a client-level record knows about itself, for matching any scope. */
export interface ScopeSubject {
  readonly branch?: string;
  readonly segment?: string;
  readonly channel?: string;
  readonly rmName?: string;
  readonly underlyings?: readonly string[];
}

export function matchesScope(subject: ScopeSubject, scope: BookScope): boolean {
  const value = scopeValue(scope);
  switch (scopeKind(scope)) {
    case 'all':
      return true;
    case 'district':
      return !!subject.branch && DISTRICT_OF_BRANCH[subject.branch] === value;
    case 'branch':
      return subject.branch === value;
    case 'rm':
      return subject.rmName === value;
    case 'segment':
      return subject.segment === value;
    case 'channel':
      return subject.channel === value;
    case 'underlying':
      return !!subject.underlyings?.includes(value);
  }
}

/** True when aggregates kept by branch, segment and channel can answer this scope. */
export function aggregatesCover(scope: BookScope): boolean {
  const kind = scopeKind(scope);
  return kind !== 'rm' && kind !== 'underlying';
}

/** Aggregate rows (by branch, segment, channel) in a scope. RM and underlying fall back to everything. */
export function matchesAggregate(row: { branch: string; segment: string; channel?: string }, scope: BookScope): boolean {
  if (!aggregatesCover(scope)) {
    return true;
  }
  const channel = row.channel ?? (row.branch === 'Digibank' ? 'digibank' : 'advisory');
  return matchesScope({ branch: row.branch, segment: row.segment, channel }, scope);
}
