import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../testing/test-config';
import { HandoffStore, NewHandoffItem } from './handoff.store';

const chan: NewHandoffItem = { clientId: 'c-4821', clientName: 'Chan Tai Man', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Maturity', idea: null, underlyings: [], from: 'Today' };

function setup() {
  TestBed.configureTestingModule({
    providers: [{ provide: APP_CONFIG, useValue: { ...TEST_CONFIG, dataSource: 'gateway' } }, provideHttpClient(), provideHttpClientTesting()],
  });
  return { store: TestBed.inject(HandoffStore), http: TestBed.inject(HttpTestingController) };
}

describe('HandoffStore in gateway mode', () => {
  it('stores the sent list and takes the gateway id, so a later trade can be linked to it', () => {
    const { store, http } = setup();
    store.add(chan);
    const local = store.markSent()!;
    const req = http.expectOne('/api/hk-eli/handoffs');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.items[0].clientId).toBe('c-4821');
    req.flush({ ...local, id: 'HO-1A2B3C4D', role: 'pm' });
    expect(store.records()[0].id).toBe('HO-1A2B3C4D');
    expect(store.records()[0].role).toBe('CBG Product Manager');
    expect(store.saveError()).toBeNull();

    store.recordDeskDecline('HO-1A2B3C4D', local.items[0].id, 'Over the NVDA limit');
    const patch = http.expectOne(`/api/hk-eli/handoffs/HO-1A2B3C4D/items/${local.items[0].id}`);
    expect(patch.request.body).toEqual({ status: 'desk-declined', note: 'Over the NVDA limit' });
    patch.flush({});
    http.verify();
  });

  it('says so when the list was not saved', () => {
    const { store, http } = setup();
    store.add(chan);
    store.markSent();
    http.expectOne('/api/hk-eli/handoffs').flush('down', { status: 503, statusText: 'Unavailable' });
    expect(store.saveError()).toContain('not saved');
    expect(store.records()[0].items[0].clientId).toBe('c-4821');
  });
});
