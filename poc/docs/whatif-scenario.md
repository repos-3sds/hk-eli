# What-if simulation and live Tableau views

*HK ELI Chatbot. \*Will be part of Ask-MIRA in future.*

Ask "If NVDA falls below 10%, what happens? How many portfolios will change status?" or "If I change the
market spot from 100 to 80%, what happens?". The answer is a what-if card with a slider, and every Tableau
view about the topic embedded underneath with the same filters. Moving the slider changes the words, the
tiles, the charts and the embedded views together.

All data in this repo is fictional.

## How it reads the question

| Words | Read as |
|---|---|
| "NVDA falls below 10%", "drops 10%", "-10%" | NVDA moves **10% down from today's level** (not "falls to 10% of the initial price"). The answer says so. |
| "goes up 5%" | +5% |
| "market spot 80%", "market spot from 100 to 80%", "market falls 20%" | every underlying × 0.8 (the office's Market Spot parameter) |
| "What if Tesla falls?" (no size) | asks: 5%, 10% or 20%. It never picks a size for you. |
| "portfolio" | one customer (CIF) |

## How it works (figures from code, never the model)

1. **Fetch.** Code asks the position view (`ALL_position_scenario`, the W8 sheet) for live positions with the
   stock in the basket (`In Shock Basket = TRUE`), with the asked parameters.
2. **Simulate every step.** `stork/scenario.py` applies the move to each basket stock, takes the worst of, and
   classifies it with the What is HK ELI 5.2 rules:
   KO if level ≥ KO% · EXP if strike% ≤ level < KO% · EXP(Below Strike) if below strike and not knocked in ·
   EX if knocked in (already, or the level falls below KI%). It does this for all 101 slider steps
   (0 to −100% for a stock, 100% to 0% for the market, 1 point apart).
3. **Reconcile.** The sheet's own *Predictive Result* (the Tableau calc) must give the same HKD per status as the
   engine at the asked level. If not, the answer stops with `SCENARIO_RECONCILE_FAILED`.
4. **Words.** Each step's sentence is a code template; every figure in it is checked against that step's
   numbers before it is shown (the Ask MIRA "grader on the serial path" pattern). The slider only picks a
   precomputed step, so the words can't drift from the figures.
5. **Views.** Every view of the topic gets the same filter spec. A view that can't take a filter says so on the
   view; a view that can't take the scope at all is listed, not shown with the wrong scope. The slider calls
   `changeParameterValueAsync` on each bound view (Embedding API v3; the mock page answers the same calls
   over `postMessage`).

What the card shows per step: positions that change predicted status (of how many exposed), deals, notional
affected and its share, customers, new knock-ins, positions within 5 points of KI, the transitions
(KO → Expiry, Expiry → Below strike, ...), where it lands by segment, district and branch, and the ten largest
positions on a KI / strike / KO ladder from today to the picked level.

**Better than the office's simulation view today:** the photographed `ALL_outstanding_simulation_n30d` notes
"Browser changes do not refresh the saved narrative". Here the narrative is recomputed and checked for every
step, and the move can be a single stock, not only the whole market.

## Data gaps and the W8 ask for the Tableau owners

The current HK_ELI views can't do a single-stock what-if: views 9 and 10 have only Market Spot, which moves every
stock at once, and they show the worst-performing stock only. On the current workbook the chatbot answers a
market move with notional only and says a single-stock move needs W8.

**W8. Position scenario sheet (`ALL_position_scenario`)**, all segments, live positions, one row per position:

- Columns: `pos_id, asset_id, cif_id, bp_div_type, cust_district, cust_branch, rm_name, asset_tks, asset_tks_2,
  asset_tks_mtm, asset_tks_2_mtm, wps, wps_mtm, strike_percentage, ko_percentage, ki_percentage,
  has_knocked_in, predict_result, predict_maturity`, plus the calcs below. Text: `SUM(volume_bu)`.
- Parameters: **Market Spot** (real, default 1.0, 0–2.0; the existing one is 0.5–1.2, so widen it), **Shock Ticker** (string, default
  empty), **Shock %** (real, default 0, −1.0 to 1.0).
- Filters (shown): Deal Status, Bp Div Type, Cust District, Cust Branch, In Shock Basket, Wps, Predict Result.
- Calcs (exact text in `scripts/build_twbx.py`):

```
Leg 1   = [asset_tks_mtm]   * IIF([asset_tks]   = [Shock Ticker], 1 + [Shock %], 1) * [Market Spot]
Leg 2   = [asset_tks_2_mtm] * IIF([asset_tks_2] = [Shock Ticker], 1 + [Shock %], 1) * [Market Spot]
Sim     = IF ISNULL([asset_tks_2_mtm]) THEN Leg 1 ELSE MIN(Leg 1, Leg 2) END
Predictive Result = IF Sim >= [ko_percentage] THEN 'KO' ELSEIF Sim >= [strike_percentage] THEN 'EXP'
                    ELSEIF [has_knocked_in] <> 'True' AND Sim >= [ki_percentage] THEN 'EXP(Below Strike)' ELSE 'EX' END
Sim Wps Mtm = ROUND(Sim, 1)
In Shock Basket = IIF([asset_tks] = [Shock Ticker] OR [asset_tks_2] = [Shock Ticker], 'TRUE', 'FALSE')
```

With no stock shock, Sim = `wps_mtm × Market Spot`, the same as views 9 and 10 today. The mock workbook
(`tableau/HK_ELI.twbx`, 14 sheets) already has it, so the owners can open it and copy it.

## Checked against the HK ELI documentation extract (2026-11-23)

The colleague's reconstructed extract (`eli-extract.md`, synthetic) uses the same predictive result rules in
the same order (KO ≥ KO%, EXP ≥ strike%, Below Strike if ≥ KI% and not knocked in, else EX); a test walks its
worked examples. Its Market Spot (`wps_mtm/100 × (0.95 + RAND×0.1)`) is a random test fixture, so it is not
used: our figures must repeat and match Tableau. Its spelling `EXP_BELOW_STRIKE` is accepted as a synonym.
Still open, and asked of the office with W8: per-stock memory KO flags, `ko_start_date`, KO observation
frequency, KI observation type (daily or at maturity), and simulated predicted maturity.

**Field names.** The extract's names land on our fields as catalog synonyms (`scripts/build_catalog.py`,
`DOC_ALIASES`): `strike_pct` → strike_percentage, `ko_pct`/`ko_price`/call price → ko_percentage,
`ki_pct`/`ki_price` → ki_percentage, `deal_id` → asset_id, `mtm_pct` → wps_mtm, `notional_hkd` → volume_bu,
`underlying_1`/`underlying_2` → asset_tks/asset_tks_2, `client_count` → distinct customers. TRE, TPC and PB
already resolve to the three segments.

**Baskets of 3 or 4 stocks.** The engine (`stork/scenario.py`: `legs()`, `simulate()`, `positions_from_rows()`)
takes any number of basket stocks and reads `Asset Tks 3 / Asset Tks 3 Mtm` and `Asset Tks 4 / Asset Tks 4 Mtm`
when the W8 sheet has them; the worst of all legs is picked after the move. The mock workbook stays at two
legs, as HK_ELI is today. **Conditional on the office:** if 3–4 stock baskets exist, add to W8 the columns
`asset_tks_3, asset_tks_3_mtm, asset_tks_4, asset_tks_4_mtm` (captions as above) and extend the calcs:

```
Leg 3 = [asset_tks_3_mtm] * IIF([asset_tks_3] = [Shock Ticker], 1 + [Shock %], 1) * [Market Spot]
Leg 4 = [asset_tks_4_mtm] * IIF([asset_tks_4] = [Shock Ticker], 1 + [Shock %], 1) * [Market Spot]
Sim   = MIN(MIN(Leg 1, IFNULL(Leg 2, Leg 1)), MIN(IFNULL(Leg 3, Leg 1), IFNULL(Leg 4, Leg 1)))   -- Tableau's row-level MIN takes two arguments
In Shock Basket also checks asset_tks_3 and asset_tks_4.
```

## Not modelled (said on every answer)

An instant move from today with everything else unchanged: no time decay, no path, no correlation between
stocks. KO means "at or above the KO level", not a confirmed call date; daily memory KO, KO start dates and
observation schedules are not in the views. Predicted maturity and KO answers elsewhere cover Treasures (HK)
only; the what-if covers all segments because W8 does.

## Office checks

See `OFFICE-CHECKLIST.md` B8 and B14 to B16.
