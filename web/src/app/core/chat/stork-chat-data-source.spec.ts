import { StorkAnswer, toChatAnswer } from './stork-chat-data-source';

const BRANCHES: StorkAnswer = {
  question: 'Which branches have the most TRE maturities in the next 30 days?',
  status: 'OK',
  headline: 'Central leads with HKD 55.0m of TRE predicted maturity in the next 30 days.',
  caveats: [{ code: 'PREDICTIVE', level: 'info', text: 'Predicted results are model estimates.' }],
  table: { columns: ['District', 'Branch', 'HKD', 'Customers'], rows: [['D1', 'Central', 'HKD 55.0m', '10']] },
  chart: { kind: 'hbar', title: 'TRE predicted maturity by branch', categories: [{ key: 'Central', label: 'Central · D1', parts: [{ result: 'KO', value: 55e6 }], total: 55e6 }] },
  evidence: [{ view: 'TRE_maturity_branch_n30d', request: '/views/x/data?vf_in_n30=TRUE', row_count: 36 }],
  embed: { url: '/tableau/proposed/views/TRE_maturity_branch_n30d?in_n30=TRUE' },
  followups: ['Show the clients behind Central maturing in the next 30 days'],
  as_of: { business_date: '2026-11-18', last_refresh: '2026-11-19T06:12', known: true },
  scope: 'TRE · predicted maturity next 30 days',
  trace: [{ n: 1, name: 'Pre-parse', detail: { window_days: 30 }, ms: 0.1 }],
  assumptions: ["'Maturity' means predicted maturity."],
};

describe('toChatAnswer', () => {
  it('keeps the pipeline figures and adds chart, table, caveats and evidence blocks in order', () => {
    const a = toChatAnswer(BRANCHES, 's-1');
    expect(a.blocks.map((b) => b.kind)).toEqual(['text', 'chart', 'table', 'notices', 'evidence']);
    const table = a.blocks[2];
    expect(table.kind === 'table' && table.numeric).toEqual([2, 3]);
    expect(a.sources).toEqual(['TRE_maturity_branch_n30d']);
    expect(a.businessDate).toBe('2026-11-18');
    expect(a.tableauUrl).toContain('TRE_maturity_branch_n30d');
    expect(a.fallback).toBe(false);
  });

  it('marks questions the pipeline could not answer as a fallback', () => {
    const a = toChatAnswer({ question: 'Brief me on Chan', status: 'NEEDS_CLARIFICATION', headline: 'I can answer…' }, 's-2');
    expect(a.fallback).toBe(true);
    expect(a.blocks).toEqual([{ kind: 'text', text: 'I can answer…' }]);
  });
});
