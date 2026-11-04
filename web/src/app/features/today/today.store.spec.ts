import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { MockTodayDataSource } from '../../core/data/mock-today-data-source';
import { TodayDataSource } from '../../core/data/today-data-source';
import { TEST_CONFIG } from '../../testing/test-config';
import { TodayStore } from './today.store';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await TestBed.inject(ApplicationRef).whenStable();
  }
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      TodayStore,
      { provide: APP_CONFIG, useValue: TEST_CONFIG },
      { provide: TodayDataSource, useClass: MockTodayDataSource },
    ],
  });
  const store = TestBed.inject(TodayStore);
  await settle();
  return store;
}

describe('TodayStore', () => {
  it('loads the brief and caps it at the lead limit', async () => {
    const store = await setup();
    expect(store.allLeads()).toHaveLength(4);
    expect(store.visibleLeads()).toHaveLength(3);
    expect(store.hiddenLeads().map((l) => l.clientShortName)).toEqual(['Ho S.']);
    store.showAllLeads.set(true);
    expect(store.visibleLeads()).toHaveLength(4);
  });

  it('greets the launch user and counts the clients still needing attention', async () => {
    const store = await setup();
    expect(store.salutation()).toMatch(/, Kelly$/);
    expect(store.headline()).toBe('4 clients need attention today.');
    store.parkLead(store.allLeads()[0]);
    expect(store.headline()).toBe('3 clients need attention today.');
    expect(store.visibleLeads().some((l) => l.clientId === 'c-4821')).toBe(false);
  });

  it('focuses the dock client\'s lead and steps through the brief, wrapping round', async () => {
    const store = await setup();
    expect(store.focusedLead()?.clientId).toBe('c-4821');
    expect(store.focusedRank()).toBe(1);
    store.stepLead(1);
    expect(store.focusedRank()).toBe(2);
    store.stepLead(-1);
    store.stepLead(-1);
    expect(store.focusedRank()).toBe(4);
  });

  it('has no focused lead for a client outside the brief or once parked', async () => {
    const store = await setup();
    store.parkLead(store.allLeads()[0]);
    expect(store.focusedLead()).toBeNull();
    store.pickClient('c-9034');
    expect(store.focusedLead()).toBeNull();
  });

  it('starts with the panel closed and opens it when a client is picked', async () => {
    const store = await setup();
    expect(store.dockOpen()).toBe(false);
    store.pickClient('c-1093');
    expect(store.dockOpen()).toBe(true);
    expect(store.focusedLead()?.clientId).toBe('c-1093');
  });

  it('builds the landing headline and suggestions from the open leads', async () => {
    const store = await setup();
    expect(store.headline()).toBe('4 clients need attention today.');
    expect(store.suggestions()[0]).toBe('Brief me on Chan');
  });

  it('undoes Not today', async () => {
    const store = await setup();
    const lead = store.allLeads()[0];
    store.parkLead(lead);
    store.unparkLead(lead);
    expect(store.visibleLeads()[0].id).toBe(lead.id);
  });

  it('filters by moment type and by day, and clears both', async () => {
    const store = await setup();
    store.toggleType('maturity');
    expect(store.matchingLeads().some((l) => l.moment.type === 'maturity')).toBe(false);
    expect(store.filtersActive()).toBe(true);
    store.clearFilters();
    store.focusDay(1);
    expect(store.matchingLeads().map((l) => l.clientShortName)).toEqual(['Wong K.L.']);
    store.focusDay(1);
    expect(store.focusedDay()).toBeNull();
  });

  it('shows the top lead in the dock until the RM picks a client, and goes back on clear', async () => {
    const store = await setup();
    expect(store.dockClientId()).toBe('c-4821');
    expect(store.pickedShortName()).toBeNull();
    store.pickClient('c-1093');
    expect(store.dockClientId()).toBe('c-1093');
    store.clearPickedClient();
    expect(store.dockClientId()).toBe('c-4821');
  });

  it('switching scope resets the day focus', async () => {
    const store = await setup();
    store.focusDay(3);
    store.setScope('team');
    expect(store.focusedDay()).toBeNull();
    await settle();
    expect(store.strip.value()?.moments.some((m) => m.clientId === 'c-9034')).toBe(true);
  });

  it('prefills the composer when asking about a client', async () => {
    const store = await setup();
    store.askAbout('Chan Tai Man');
    expect(store.composerDraft()).toContain('Chan Tai Man');
  });
});
