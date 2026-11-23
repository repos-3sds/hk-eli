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

  it('turns a value to pick into option buttons and lists the catalog terms it read', () => {
    const a = toChatAnswer({
      question: 'How much TRE ELI matures in Bay branch in the next 30 days?', status: 'NEEDS_CLARIFICATION',
      headline: "'Bay' fits more than one branch: Causeway Bay, Kowloon Bay. Which one do you mean?",
      clarify: { code: 'VALUE_AMBIGUOUS', label: 'branch', text: 'bay', options: [
        { label: 'Causeway Bay', question: 'How much TRE ELI matures in Causeway Bay branch in the next 30 days?' },
        { label: 'Kowloon Bay', question: 'How much TRE ELI matures in Kowloon Bay branch in the next 30 days?' }] },
      concepts: [{ concept: 'bp_div_type', label: 'Business segment', value: 'TRE' }, { concept: 'predict_maturity', label: 'Predicted maturity' },
                 { concept: 'predict_maturity', label: 'Predicted maturity' }, { concept: 'coupon', label: 'Coupon', gap: true }],
    }, 's-3');
    expect(a.clarify?.kind).toBe('ambiguous');
    expect(a.clarify?.options.map((o) => o.label)).toEqual(['Causeway Bay', 'Kowloon Bay']);
    expect(a.understood).toEqual([{ label: 'Coupon', value: undefined, gap: true }, { label: 'Business segment', value: 'TRE', gap: false }, { label: 'Predicted maturity', value: undefined, gap: false }]);
  });
});

describe('toChatAnswer did you mean', () => {
  it('turns readings the agent is unsure about into "Did you mean" choices that each ask a full question', () => {
    const a = toChatAnswer({
      question: 'TRE Wan Chai', status: 'NEEDS_CLARIFICATION',
      headline: "I can read that two ways, so I haven't run a query yet. Pick the answer you want.",
      clarify: { code: 'INTENT_UNSURE', label: 'reading', text: '', options: [
        { label: 'Maturity by branch', question: 'Which branches have the largest TRE predicted maturity in the next 30 days?' },
        { label: 'Customers maturing', question: 'How many TRE customers at Wan Chai have predicted maturity in the next 30 days?' }] },
    }, 's-4');
    expect(a.fallback).toBe(true);
    expect(a.clarify?.kind).toBe('reading');
    expect(a.clarify?.options[1].question).toContain('Wan Chai');
  });
});

describe('toChatAnswer what-if', () => {
  const WHATIF = {
    ...BRANCHES,
    headline: 'A 10% fall in NVDA UW would change the predicted status of 30 of the 101 live positions.',
    scenario: { kind: 'single', ticker: 'NVDA UW', move: -0.1, moves: [0, -0.1], asked_index: 1, grid: [], ladder: [] },
    embeds: [
      { view: 'ALL_position_scenario', record_id: 'position-scenario-all', title: 'Position scenario', role: 'primary', kind: 'table',
        url: '/tableau/proposed/views/ALL_position_scenario?shock_pct=-0.1', filters: { in_shock_basket: ['TRUE'] },
        parameters: [{ name: 'shock_pct', caption: 'Shock %', value: -0.1 }], bind: 'shock_pct', notes: [], cannot_apply: [] },
      { view: 'TRE_x', record_id: 'tre-x', skipped: true, why_not: 'fixed 30-day window' },
    ],
  } as unknown as StorkAnswer;

  it('puts the words in the scenario block, then every view of the topic', () => {
    const a = toChatAnswer(WHATIF, 's-2');
    const kinds = a.blocks.map((b) => b.kind);
    expect(kinds[0]).toBe('scenario');
    expect(kinds).not.toContain('text');
    const views = a.blocks.find((b) => b.kind === 'views');
    expect(views?.kind === 'views' && views.embeds.map((e) => [e.recordId, e.bind ?? null, e.vizKind ?? null, !!e.skipped])).toEqual([
      ['position-scenario-all', 'shock_pct', 'table', false],
      ['tre-x', null, null, true],
    ]);
  });
});
