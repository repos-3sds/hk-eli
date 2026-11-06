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
    expect(store.allLeads()).toHaveLength(12);
    expect(store.visibleLeads()).toHaveLength(3);
    expect(store.hiddenLeads()).toHaveLength(9);
    store.showAllLeads.set(true);
    expect(store.visibleLeads()).toHaveLength(12);
  });

  it('greets the launch user and counts the clients still needing attention', async () => {
    const store = await setup();
    expect(store.salutation()).toMatch(/, Kelly$/);
    expect(store.attentionLine()).toBe('12 clients need attention today.');
    store.parkLead(store.allLeads()[0]);
    expect(store.attentionLine()).toBe('11 clients need attention today.');
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
    expect(store.focusedRank()).toBe(12);
  });

  it('has no focused lead for a client outside the brief or once parked', async () => {
    const store = await setup();
    store.parkLead(store.allLeads()[0]);
    expect(store.focusedLead()).toBeNull();
    store.pickClient('c-9999');
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
    expect(store.headline()).toBe('USD 11.98m matures in the next 10 business days; 3 pockets are below the rollover line.');
    expect(store.briefSummary()).toMatch(/^12 clients need attention: 6 maturities, 2 likely knock-outs, 1 stock delivery, 1 idle client and 2 open RFQs\. Start with Chan Tai Man/);
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
    store.clearFilters();
    store.showPocket(store.pocketsBelow()[0]);
    expect(store.matchingLeads().map((l) => l.clientShortName)).toEqual(['Chan T.', 'Lee M.', 'Fung R.']);
    expect(store.filtersActive()).toBe(true);
    store.clearFilters();
    expect(store.pocketFilter()).toBeNull();
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

  it('headline says when no pocket is below the line', async () => {
    const store = await setup();
    store.setScope('branch:Central');
    await settle();
    expect(store.headline()).toBe('USD 4.5m matures in the next 10 business days; rollover is at or above the line everywhere.');
    expect(store.pocketsBelow()).toEqual([]);
  });

  it('switching scope resets the day focus', async () => {
    const store = await setup();
    store.focusDay(3);
    store.setScope('branch:Central');
    expect(store.focusedDay()).toBeNull();
    await settle();
    expect(store.strip.value()?.moments.map((m) => m.clientId).sort()).toEqual(['c-1093', 'c-6618']);
    expect(store.scopeName()).toBe('Central');
  });

  it('prefills the composer when asking about a client', async () => {
    const store = await setup();
    store.askAbout('Chan Tai Man');
    expect(store.composerDraft()).toContain('Chan Tai Man');
  });
});
