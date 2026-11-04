import { TestBed } from '@angular/core/testing';
import { SessionService, isLaunchRole } from './session.service';

describe('SessionService', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('signs in a GFM WMS specialist by default, never an RM', () => {
    const s = TestBed.inject(SessionService);
    expect(s.role()).toBe('wms');
    expect(s.roleLabel()).toBe('GFM WMS specialist');
    expect(isLaunchRole('RM')).toBe(false);
  });

  it('takes the demo role from ?role= and can switch', () => {
    window.history.replaceState(null, '', '/?role=pm');
    const s = TestBed.inject(SessionService);
    expect(s.user().displayName).toBe('Daniel Cheng');
    s.switchRole('tsm');
    expect(s.roleLabel()).toBe('CBG Treasury Sales Manager');
  });
});
