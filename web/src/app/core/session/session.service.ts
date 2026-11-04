import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/** The three launch roles. RMs come later, once internal feedback is good. */
export type LaunchRole = 'wms' | 'pm' | 'tsm';

export const LAUNCH_ROLES: readonly LaunchRole[] = ['wms', 'pm', 'tsm'];

export const ROLE_LABELS: Record<LaunchRole, string> = {
  wms: 'GFM WMS specialist',
  pm: 'CBG Product Manager',
  tsm: 'CBG Treasury Sales Manager',
};

/** The short name used in tight places such as the header chip. */
/** Each launch role opens on its own first view: the PM on the shelf console, WMS and TSM on Today. */
export const START_VIEWS: Record<LaunchRole, string> = { wms: 'today', pm: 'shelf', tsm: 'today' };

export const ROLE_SHORT: Record<LaunchRole, string> = { wms: 'GFM WMS', pm: 'CBG PM', tsm: 'CBG TSM' };

export interface SignedInUser {
  readonly displayName: string;
  readonly firstName: string;
  readonly location: string;
  readonly role: LaunchRole;
}

/** Fictional demo users, one per launch role. */
const DEMO_USERS: Record<LaunchRole, SignedInUser> = {
  wms: { displayName: 'Kelly Lau', firstName: 'Kelly', location: 'Hong Kong', role: 'wms' },
  pm: { displayName: 'Daniel Cheng', firstName: 'Daniel', location: 'Hong Kong', role: 'pm' },
  tsm: { displayName: 'Grace Ho', firstName: 'Grace', location: 'Hong Kong', role: 'tsm' },
};

export function isLaunchRole(value: unknown): value is LaunchRole {
  return typeof value === 'string' && (LAUNCH_ROLES as readonly string[]).includes(value);
}

/**
 * Who is signed in. Digimarkets supplies the identity and the role; until that is wired, a fictional
 * launch user. `?role=wms|pm|tsm` picks the demo user, and the header lets a demo switch role.
 * Every call runs as this person; nothing reads data under a shared identity.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly document = inject(DOCUMENT);

  readonly user = signal<SignedInUser>(DEMO_USERS[this.roleFromUrl() ?? 'wms']);
  readonly role = computed(() => this.user().role);
  readonly roleLabel = computed(() => ROLE_LABELS[this.role()]);

  /** Demo only: the real role comes from Digimarkets entitlements. */
  switchRole(role: LaunchRole): void {
    this.user.set(DEMO_USERS[role]);
  }

  private roleFromUrl(): LaunchRole | null {
    const value = new URLSearchParams(this.document.location?.search ?? '').get('role');
    return isLaunchRole(value) ? value : null;
  }
}
