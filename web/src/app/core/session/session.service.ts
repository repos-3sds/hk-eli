import { Injectable, signal } from '@angular/core';

export interface SignedInUser {
  readonly displayName: string;
  readonly firstName: string;
  readonly location: string;
  readonly role: 'RM' | 'TS' | 'PM' | 'Manager' | 'Leader';
}

/**
 * Who is signed in. Digimarkets supplies the identity; until it is wired, a fictional RM.
 * Every call runs as this person; nothing reads data under a shared identity.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly user = signal<SignedInUser>({
    displayName: 'Srivalli T.',
    firstName: 'Srivalli',
    location: 'Hong Kong',
    role: 'RM',
  });
}
