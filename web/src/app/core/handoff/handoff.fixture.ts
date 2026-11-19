import { HandoffRecord } from './handoff.models';

/**
 * Two earlier hand-offs, so the record and linked conversion have something to show on day one.
 * Fictional, like all the demo data. A real record comes from the gateway, which links trades from the blotter.
 */
export const PAST_HANDOFFS: readonly HandoffRecord[] = [
  {
    id: 'ho-1012',
    sentAt: '2026-10-12T09:40:00+08:00',
    sentBy: 'Kelly Lau',
    role: 'GFM WMS specialist',
    windowEnds: '2026-10-26',
    items: [
      { id: 'hi-1', clientId: 'c-2045', clientName: 'Ng Pui Yee', ownerRm: 'Mandy Chow', branch: 'Mong Kok', reason: 'Maturity, rollover', idea: { title: 'AMD / META worst-of · 6M', terms: 'coupon 17.1% p.a. · KI 65% · strike 90%', pricedAt: '2026-10-12T09:05:00+08:00' }, underlyings: ['AMD', 'META'], from: 'Today', addedAt: '2026-10-12T09:20:00+08:00' },
      { id: 'hi-2', clientId: 'c-3356', clientName: 'Kwok Dik', ownerRm: 'Mandy Chow', branch: 'Mong Kok', reason: 'Maturity, rollover', idea: null, underlyings: ['AMD'], from: 'Today', addedAt: '2026-10-12T09:22:00+08:00' },
      { id: 'hi-3', clientId: 'c-8890', clientName: 'Tsang Jun', ownerRm: 'Peter Leung', branch: 'Tsim Sha Tsui', reason: 'Likely knock-out', idea: { title: 'TSLA · 3M', terms: 'coupon 23.8% p.a. · KI 60% · strike 85%', pricedAt: '2026-10-12T09:05:00+08:00' }, underlyings: ['TSLA'], from: 'Ideas', addedAt: '2026-10-12T09:31:00+08:00' },
      { id: 'hi-4', clientId: 'c-9034', clientName: 'Ma Ka Wai', ownerRm: 'Peter Leung', branch: 'Tsim Sha Tsui', reason: 'Idle 60+ days', idea: null, underlyings: ['NVDA'], from: 'Today', addedAt: '2026-10-12T09:33:00+08:00' },
    ],
    outcomes: {
      'hi-1': { status: 'linked-trade', note: 'Traded AMD / META 6M on 15 Oct' },
      'hi-2': { status: 'window-closed', note: null },
      'hi-3': { status: 'linked-trade', note: 'Traded TSLA 3M on 14 Oct' },
      'hi-4': { status: 'desk-declined', note: 'NVDA near the book limit' },
    },
  },
  {
    id: 'ho-1021',
    sentAt: '2026-10-21T10:05:00+08:00',
    sentBy: 'Grace Ho',
    role: 'CBG Treasury Sales Manager',
    windowEnds: '2026-11-04',
    items: [
      { id: 'hi-5', clientId: 'c-4821', clientName: 'Chan Tai Man', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Kwun Tong pocket below the rollover line', idea: null, underlyings: ['NVDA', 'AMD'], from: 'Today', addedAt: '2026-10-21T09:50:00+08:00' },
      { id: 'hi-6', clientId: 'c-1177', clientName: 'Fung Ray', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Kwun Tong pocket below the rollover line', idea: { title: 'MSFT / GOOGL worst-of · 6M', terms: 'coupon 13.9% p.a. · KI 70% · strike 92%', pricedAt: '2026-10-21T09:05:00+08:00' }, underlyings: ['MSFT', 'GOOGL'], from: 'Ideas', addedAt: '2026-10-21T09:58:00+08:00' },
      { id: 'hi-7', clientId: 'c-7720', clientName: 'Lee Mei', ownerRm: 'Srivalli T.', branch: 'Kwun Tong', reason: 'Kwun Tong pocket below the rollover line', idea: null, underlyings: ['AMD'], from: 'Today', addedAt: '2026-10-21T10:01:00+08:00' },
    ],
    outcomes: {
      'hi-5': { status: 'sent', note: null },
      'hi-6': { status: 'linked-trade', note: 'Traded MSFT / GOOGL 6M on 24 Oct' },
      'hi-7': { status: 'sent', note: null },
    },
  },
];

/** Comparable maturing clients in pockets that got no hand-off: share that traded inside 10 business days. */
export const NO_HANDOFF_CONVERSION_PCT = 18;
