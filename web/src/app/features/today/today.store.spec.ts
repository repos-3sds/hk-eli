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

  it('greets with the count of clients still needing the RM', async () => {
    const store = await setup();
    expect(store.greeting()).toMatch(/, Srivalli\. 4 clients need you today\.$/);
    store.parkLead(store.allLeads()[0]);
    expect(store.greeting()).toContain('3 clients need you today');
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

  it('shows the linked client in the dock until the RM picks another', async () => {
    const store = await setup();
    expect(store.dockClientId()).toBe('c-4821');
    store.pickClient('c-1093');
    await settle();
    expect(store.dockClientId()).toBe('c-1093');
    expect(store.client.value()?.name).toBe('Wong Ka Lok');
  });

  it('falls back to the top lead when the linked context is cleared', async () => {
    const store = await setup();
    store.clearLinkedContext();
    expect(store.dockClientId()).toBe(store.allLeads()[0].clientId);
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
