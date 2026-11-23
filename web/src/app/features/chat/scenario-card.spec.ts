import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ScenarioSpec } from '../../core/chat/chat.models';
import { ScenarioCard, emphasise, levelLabel, money } from './scenario-card';
import { filterChips } from './tableau-views';

/** NVDA UW -10% from the agent (proposed site), trimmed to three steps: today, -10% (asked), -20%. */
const NVDA = {
 "kind": "single",
 "ticker": "NVDA UW",
 "label": "NVDA UW falls 10%",
 "move": -0.1,
 "assumption": null,
 "near_ki_points": 5.0,
 "control": {
  "name": "shock_pct",
  "caption": "NVDA UW move",
  "unit": "move"
 },
 "moves": [
  0.0,
  -0.1,
  -0.2
 ],
 "asked_index": 1,
 "universe": {
  "positions": 101,
  "deals": 77,
  "customers": 94,
  "hkd": 294219976.0,
  "as_wps": 48
 },
 "grid": [
  {
   "move": 0.0,
   "label": "NVDA UW unchanged",
   "statuses": {
    "KO": {
     "hkd": 124802024.0,
     "positions": 45
    },
    "EXP": {
     "hkd": 144018792.0,
     "positions": 48
    },
    "EXP(Below Strike)": {
     "hkd": 23399000.0,
     "positions": 7
    },
    "EX": {
     "hkd": 2000160.0,
     "positions": 1
    }
   },
   "changed": {
    "positions": 0,
    "deals": 0,
    "customers": 0,
    "hkd": 0,
    "share": 0.0,
    "worse": 0,
    "better": 0
   },
   "transitions": [],
   "knock_in_new": {
    "positions": 0,
    "hkd": 0
   },
   "near_ki": {
    "positions": 0,
    "hkd": 0
   },
   "ko_lost": {
    "positions": 0,
    "hkd": 0
   },
   "by_segment": [
    {
     "key": "PB",
     "label": "PB",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 132019980.0
    },
    {
     "key": "Treasures(HK)",
     "label": "TRE",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 131708988.0
    },
    {
     "key": "Treasures(TPC)",
     "label": "TPC",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 30491008.0
    }
   ],
   "by_district": [
    {
     "key": "No district",
     "label": "PB / TPC (no district)",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 162510988.0
    },
    {
     "key": "TRE-D3",
     "label": "D3",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 65503944.0
    }
   ],
   "by_branch": [
    {
     "key": "Tsuen Wan",
     "label": "Tsuen Wan",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 23502984.0
    },
    {
     "key": "Yuen Long",
     "label": "Yuen Long",
     "changed_hkd": 0.0,
     "changed_positions": 0,
     "exposed_hkd": 20000480.0
    }
   ],
   "narrative": "At today's levels nothing changes. This covers the 101 live positions with NVDA UW in the basket (HKD 294.2M); move the slider to see which positions would change predicted status.",
   "narrative_checked": true
  },
  {
   "move": -0.1,
   "label": "NVDA UW falls 10%",
   "statuses": {
    "KO": {
     "hkd": 38897144.0,
     "positions": 16
    },
    "EXP": {
     "hkd": 229423672.0,
     "positions": 76
    },
    "EXP(Below Strike)": {
     "hkd": 23899000.0,
     "positions": 8
    },
    "EX": {
     "hkd": 2000160.0,
     "positions": 1
    }
   },
   "changed": {
    "positions": 30,
    "deals": 23,
    "customers": 29,
    "hkd": 86404880.0,
    "share": 0.2937,
    "worse": 30,
    "better": 0
   },
   "transitions": [
    {
     "from": "KO",
     "to": "EXP",
     "positions": 29,
     "hkd": 85904880.0
    },
    {
     "from": "EXP",
     "to": "EXP(Below Strike)",
     "positions": 1,
     "hkd": 500000.0
    }
   ],
   "knock_in_new": {
    "positions": 0,
    "hkd": 0
   },
   "near_ki": {
    "positions": 0,
    "hkd": 0
   },
   "ko_lost": {
    "positions": 29,
    "hkd": 85904880.0
   },
   "by_segment": [
    {
     "key": "PB",
     "label": "PB",
     "changed_hkd": 50211080.0,
     "changed_positions": 14,
     "exposed_hkd": 132019980.0
    },
    {
     "key": "Treasures(HK)",
     "label": "TRE",
     "changed_hkd": 32197000.0,
     "changed_positions": 13,
     "exposed_hkd": 131708988.0
    },
    {
     "key": "Treasures(TPC)",
     "label": "TPC",
     "changed_hkd": 3996800.0,
     "changed_positions": 3,
     "exposed_hkd": 30491008.0
    }
   ],
   "by_district": [
    {
     "key": "No district",
     "label": "PB / TPC (no district)",
     "changed_hkd": 54207880.0,
     "changed_positions": 17,
     "exposed_hkd": 162510988.0
    },
    {
     "key": "TRE-D1",
     "label": "D1",
     "changed_hkd": 15997800.0,
     "changed_positions": 5,
     "exposed_hkd": 41299404.0
    }
   ],
   "by_branch": [
    {
     "key": "Admiralty",
     "label": "Admiralty",
     "changed_hkd": 8002800.0,
     "changed_positions": 1,
     "exposed_hkd": 8002800.0
    },
    {
     "key": "Central",
     "label": "Central",
     "changed_hkd": 7995000.0,
     "changed_positions": 4,
     "exposed_hkd": 9195000.0
    }
   ],
   "narrative": "A 10% fall in NVDA UW would change the predicted status of 30 of the 101 live positions with NVDA UW in the basket (HKD 294.2M): HKD 86.4M, 29.4% of that notional, across 29 customers. The largest move is KO to EXP: 29 positions, HKD 85.9M. Most of the change is in PB (HKD 50.2M).",
   "narrative_checked": true
  },
  {
   "move": -0.2,
   "label": "NVDA UW falls 20%",
   "statuses": {
    "KO": {
     "hkd": 14599460.0,
     "positions": 6
    },
    "EXP": {
     "hkd": 197509748.0,
     "positions": 67
    },
    "EXP(Below Strike)": {
     "hkd": 80110608.0,
     "positions": 27
    },
    "EX": {
     "hkd": 2000160.0,
     "positions": 1
    }
   },
   "changed": {
    "positions": 53,
    "deals": 44,
    "customers": 51,
    "hkd": 146208372.0,
    "share": 0.4969,
    "worse": 53,
    "better": 0
   },
   "transitions": [
    {
     "from": "KO",
     "to": "EXP",
     "positions": 33,
     "hkd": 89496764.0
    },
    {
     "from": "EXP",
     "to": "EXP(Below Strike)",
     "positions": 14,
     "hkd": 36005808.0
    },
    {
     "from": "KO",
     "to": "EXP(Below Strike)",
     "positions": 6,
     "hkd": 20705800.0
    }
   ],
   "knock_in_new": {
    "positions": 0,
    "hkd": 0
   },
   "near_ki": {
    "positions": 0,
    "hkd": 0
   },
   "ko_lost": {
    "positions": 39,
    "hkd": 110202564.0
   },
   "by_segment": [
    {
     "key": "PB",
     "label": "PB",
     "changed_hkd": 71013680.0,
     "changed_positions": 24,
     "exposed_hkd": 132019980.0
    },
    {
     "key": "Treasures(HK)",
     "label": "TRE",
     "changed_hkd": 60199684.0,
     "changed_positions": 24,
     "exposed_hkd": 131708988.0
    },
    {
     "key": "Treasures(TPC)",
     "label": "TPC",
     "changed_hkd": 14995008.0,
     "changed_positions": 5,
     "exposed_hkd": 30491008.0
    }
   ],
   "by_district": [
    {
     "key": "No district",
     "label": "PB / TPC (no district)",
     "changed_hkd": 86008688.0,
     "changed_positions": 29,
     "exposed_hkd": 162510988.0
    },
    {
     "key": "TRE-D1",
     "label": "D1",
     "changed_hkd": 29493004.0,
     "changed_positions": 10,
     "exposed_hkd": 41299404.0
    }
   ],
   "by_branch": [
    {
     "key": "Admiralty",
     "label": "Admiralty",
     "changed_hkd": 8002800.0,
     "changed_positions": 1,
     "exposed_hkd": 8002800.0
    },
    {
     "key": "Central",
     "label": "Central",
     "changed_hkd": 7995000.0,
     "changed_positions": 4,
     "exposed_hkd": 9195000.0
    }
   ],
   "narrative": "A 20% fall in NVDA UW would change the predicted status of 53 of the 101 live positions with NVDA UW in the basket (HKD 294.2M): HKD 146.2M, 49.7% of that notional, across 51 customers. The largest move is KO to EXP: 33 positions, HKD 89.5M. Most of the change is in PB (HKD 71.0M).",
   "narrative_checked": true
  }
 ],
 "ladder": [
  {
   "pos_id": "P700504",
   "cif_id": "C100476",
   "segment": "PB",
   "branch": "",
   "hkd": 8002800.0,
   "basket": [
    "NVDA UW"
   ],
   "strike": 82.0,
   "ki": 60.0,
   "ko": 105.0,
   "knocked_in": false,
   "now": {
    "wps": "NVDA UW",
    "mtm": 110.6,
    "status": "KO"
   },
   "path": [
    [
     110.6,
     "KO",
     "NVDA UW"
    ],
    [
     99.5,
     "EXP",
     "NVDA UW"
    ],
    [
     88.5,
     "EXP",
     "NVDA UW"
    ]
   ]
  },
  {
   "pos_id": "P701139",
   "cif_id": "C100805",
   "segment": "TRE",
   "branch": "Admiralty",
   "hkd": 8002800.0,
   "basket": [
    "NVDA UW",
    "AAPL UW"
   ],
   "strike": 88.0,
   "ki": 60.0,
   "ko": 98.0,
   "knocked_in": false,
   "now": {
    "wps": "NVDA UW",
    "mtm": 99.0,
    "status": "KO"
   },
   "path": [
    [
     99.0,
     "KO",
     "NVDA UW"
    ],
    [
     89.1,
     "EXP",
     "NVDA UW"
    ],
    [
     79.2,
     "EXP(Below Strike)",
     "NVDA UW"
    ]
   ]
  },
  {
   "pos_id": "P701133",
   "cif_id": "C100525",
   "segment": "PB",
   "branch": "",
   "hkd": 8000000.0,
   "basket": [
    "NVDA UW"
   ],
   "strike": 80.0,
   "ki": 68.0,
   "ko": 98.0,
   "knocked_in": false,
   "now": {
    "wps": "NVDA UW",
    "mtm": 107.8,
    "status": "KO"
   },
   "path": [
    [
     107.8,
     "KO",
     "NVDA UW"
    ],
    [
     97.0,
     "EXP",
     "NVDA UW"
    ],
    [
     86.2,
     "EXP",
     "NVDA UW"
    ]
   ]
  }
 ],
 "statuses": [
  "KO",
  "EXP",
  "EXP(Below Strike)",
  "EX"
 ],
 "source": "ALL_position_scenario + what-if engine",
 "checked": true
} as unknown as ScenarioSpec;

describe('what-if helpers', () => {
  it('formats money the way the agent words it', () => {
    expect(money(86_404_880)).toBe('HKD 86.4M');
    expect(money(2_460_000_000)).toBe('HKD 2.46B');
    expect(money(500_000)).toBe('HKD 500K');
  });

  it('labels a stock move and a market spot', () => {
    expect(levelLabel(NVDA, -0.1)).toBe('−10%');
    expect(levelLabel(NVDA, 0)).toBe('0%');
    expect(levelLabel({ ...NVDA, control: { name: 'market_spot', caption: 'Market spot', unit: 'spot' } }, -0.2)).toBe('80%');
  });

  it('marks figures without changing the words', () => {
    const parts = emphasise('30 of the 101 positions (HKD 294.2M) move');
    expect(parts.map((p) => p.t).join('')).toBe('30 of the 101 positions (HKD 294.2M) move');
    expect(parts.filter((p) => p.num).map((p) => p.t)).toEqual(['30', '101', 'HKD 294.2M']);
  });

  it('turns filters into chips in the user\'s words', () => {
    expect(filterChips({ deal_status: ['LIVE'], in_shock_basket: ['TRUE'], in_n30: ['TRUE'], bp_div_type: ['Treasures(HK)'] }, 'NVDA UW')).toEqual([
      { label: 'Deal Status', value: 'LIVE' },
      { label: 'Basket holds', value: 'NVDA UW' },
      { label: 'Predicted maturity', value: 'next 30 days' },
      { label: 'Segment', value: 'TRE' },
    ]);
  });
});

describe('ScenarioCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScenarioCard], providers: [provideZonelessChangeDetection()] });
    const icons = TestBed.inject(MatIconRegistry);
    const san = TestBed.inject(DomSanitizer);
    for (const n of ['sliders', 'arrow-right', 'info']) icons.addSvgIconLiteral(n, san.bypassSecurityTrustHtml('<svg></svg>'));
  });

  async function render() {
    const f = TestBed.createComponent(ScenarioCard);
    f.componentRef.setInput('spec', NVDA);
    await f.whenStable();
    return f;
  }

  it('opens at the asked level with the agent\'s own words and counts', async () => {
    const f = await render();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.title')?.textContent).toContain('NVDA UW −10%');
    expect(el.querySelector('.words')?.textContent?.trim()).toBe(NVDA.grid[1].narrative);
    expect(el.querySelector('.tile .tv')?.textContent).toBe('30');
    expect(el.querySelector('.back')).toBeNull();
  });

  it('picks another step from a preset, sends the level out and offers the way back', async () => {
    const f = await render();
    const levels: number[] = [];
    f.componentInstance.level.subscribe((v) => levels.push(v));
    const el: HTMLElement = f.nativeElement;
    const btn = [...el.querySelectorAll<HTMLButtonElement>('.preset')].find((b) => b.textContent?.includes('−20%'))!;
    btn.click();
    await f.whenStable();
    expect(levels).toEqual([-0.2]);
    expect(el.querySelector('.words')?.textContent?.trim()).toBe(NVDA.grid[2].narrative);
    expect(el.querySelector('.tile .tv')?.textContent).toBe('53');
    expect(el.querySelector('.back')?.textContent).toContain('Back to −10%');
  });

  it('keeps the overview in view and puts the details behind tabs, with the views tab only when views are given', async () => {
    const f = await render();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.overview .tiles')).not.toBeNull();
    expect(el.querySelector('.overview [role=tabpanel]')).toBeNull();
    const tabs = () => [...el.querySelectorAll<HTMLButtonElement>('.explore [role=tab]')].map((t) => t.textContent?.trim());
    expect(tabs()).toEqual(['What changes30', 'Positions vs barriers3']);
    const visible = () => [...el.querySelectorAll<HTMLElement>('[role=tabpanel]')].filter((p) => !p.hidden).map((p) => p.id.split('-panel-')[1]);
    expect(visible()).toEqual(['changes']);
    f.componentRef.setInput('viewCount', 3);
    await f.whenStable();
    expect(tabs()).toContain('Tableau views3');
    el.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
    await f.whenStable();
    expect(visible()).toEqual(['positions']);
  });

  it('takes a typed % as the nearest step, ignores a typed sign and keeps it inside the range', async () => {
    const f = await render();
    const levels: number[] = [];
    f.componentInstance.level.subscribe((v) => levels.push(v));
    const el: HTMLElement = f.nativeElement;
    const box = el.querySelector<HTMLInputElement>('.cbox')!;
    expect(box.value).toBe('10');
    expect(el.querySelector('.csign')?.textContent).toBe('−');
    expect(box.max).toBe('20');
    const type = async (v: string) => {
      box.value = v;
      box.dispatchEvent(new Event('change'));
      await f.whenStable();
    };
    await type('-19');
    expect(levels.at(-1)).toBe(-0.2);
    expect(box.value).toBe('20');
    expect(el.querySelector('.tile .tv')?.textContent).toBe('53');
    await type('250');
    expect(box.value).toBe('20');
    await type('abc');
    expect(box.value).toBe('20');
    await type('0');
    expect(levels.at(-1)).toBe(0);
    expect(el.querySelector('.crange')?.textContent).toContain('−20%');
  });
});
