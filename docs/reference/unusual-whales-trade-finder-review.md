> Walkthrough notes from 3 Nov 2026 . Reference only: HK ELI flows are our own design and borrow the ideas, not the look. The requirements that came out of it are R27 to R35 in [../discovery.md](../discovery.md).

# Unusual Whales "Trade Finder": product walkthrough for HK ELI Chatbot

Reviewed 2026-11-03 in Chrome (logged-in profile), read-only. URL: https://unusualwhales.com/ai/trade-finder
Location in the app: left nav, **Mr. Whale** group, then *Chat* (`/ai`), **Trade Finder** (`/ai/trade-finder`), and *Automations* (`/ai/tasks`).

---

## 1. The core idea in one line

> "Find stocks that line up. Start with a pack, or choose signals below. Stocks that show up in more than one rank higher."

Trade Finder is a **confluence engine**. You pick up to 10 "signals", each one a saved filter on an existing UW data feed. Every stock is then scored by **how many of the selected signals it appears in**, and the list is grouped into tiers ("In 5 of 10 signals", "In 4 of 10 signals", and so on). It does no AI scoring and gives no recommendation. The only ranking is a count of independent pieces of evidence, explained in plain English.

---

## 2. Landing page

Layout, top to bottom: title "Trade Finder", a "How it works" link, and a "Find trades" button at top right. Below that are the heading "Find stocks that line up" with its subtitle, then **Starter packs** (a 3-column card grid), then **All signals** (category chips with a card grid under each group).

### 2.1 Starter packs (10)
Each card has an icon, a name, a one-line description and a signal count. Clicking a card selects the pack (the card shows "Ranking these signals") and immediately opens the results view.

| # | Pack | Description | Signals |
|---|------|-------------|---------|
| 1 | Off-exchange size in a call-led uptrend | A large dark-pool print while calls lead the book and the chart is already rising. | 6 |
| 2 | Earnings with a paper trail | A report inside three weeks, with trades and an upgrade already on the tape. | 6 |
| 3 | Liquid S&P 500 call demand | Opening call trades in S&P 500 names with chains you can trade. | 5 |
| 4 | Testing the 52-week high | A clean yearly-high test, with a dark-pool print and call gamma behind it. | 6 |
| 5 | Call gamma in a name you can trade | Calls lead the book and today's volume is setting gamma, in liquid mega-caps. | 6 |
| 6 | An upgrade confirmed by size | Wall Street raised the bar, and an off-exchange block agrees. | 6 |
| 7 | Put selling potential | Rich option prices, puts printing on the bid, and open interest building below the stock. | 6 |
| 8 | Iron Condor Potential | Options priced for a bigger move than the stock delivered, with spreads being built on both sides. | 5 |
| 9 | Call credit spread potential | Rich option prices on a stock rolling over, with calls being sold above the price. | 7 |
| 10 | Long call potential | Calls bought at the ask from several angles, in a rising stock whose options are still cheap. | 10 |

Packs are framed around a trader's **intent or strategy**, not around data sources. Each one is a curated mix of signals drawn from several feeds.

### 2.2 All signals: "Hover a signal for a plain-English read. Pick up to 10."
The signals are grouped by **the question they answer**, not by the feed they come from. Each group has a heading and a one-sentence rationale. Each signal card shows a plain-English title and the source feed as a small caps tag. Groups with more than 6 signals collapse behind "Show N more".

**Who is actually buying.** *"People and institutions with information, capital, or a legal duty to disclose. The closest you get to seeing someone else's homework."*
- Executives buying with their own money (INSIDER TRANSACTIONS)
- The biggest shareholders adding more (INSIDER TRANSACTIONS)
- Politicians are buying (CONGRESS TRADES)
- One print that is 10% of usual volume (DARK POOL)
- One print that is 10% of the day (DARK POOL)
- Institutional size off-exchange (DARK POOL)

**What options traders are betting** (20). *"Options force a trader to name a price and a deadline. Following that money shows you where real conviction is going, not just chatter."*
- One trade bigger than the whole contract (OPTIONS FLOW)
- Call open interest rising for a week (OPEN INTEREST CHANGES)
- The same trade, paying more each time (FLOW ALERTS)
- A day's volume in a single burst (FLOW ALERTS)
- Volume overwhelming the open interest (OPTIONS SCREENER)
- Volume beating open interest for a week (OPEN INTEREST CHANGES)
- Unusual for this stock, not just large (OPTIONS SCREENER)
- Trades negotiated by hand on the floor (FLOW ALERTS)
- Out-of-the-money calls swept at the ask (FLOW ALERTS)
- Confirmed Put Sell Activity (OPTIONS SCREENER)
- Smart Money Bid-Side Puts (OPTIONS FLOW)
- OI Support on OTM Puts (OPEN INTEREST CHANGES)
- Put Flow Alert Confluence (FLOW ALERTS)
- Premium OTM Screen 25-50 DTE (OPTIONS SCREENER)
- Opening Multi-leg Flow (OPTIONS FLOW)
- OI Built by Multi-leg Orders (OPEN INTEREST CHANGES)
- Balanced OTM Alerts (FLOW ALERTS)
- Confirmed Call Sell Activity (OPTIONS SCREENER)
- Bid-Side Call Flow Alerts (FLOW ALERTS)
- OI Resistance on OTM Calls (OPEN INTEREST CHANGES)

(The title-case names, such as "Smart Money Bid-Side Puts", look like newer strategy-pack signals that haven't been rewritten into the plain-English style yet.)

**What could push the stock** (11). *"Conditions that amplify a move once it starts, and the moments Wall Street changes the story around a name."*
- Crowded shorts, expensive to hold (SHORT INTEREST SCREENER)
- Wall Street just raised the bar (ANALYST RATINGS)
- Wall Street just cut the rating (ANALYST RATINGS)
- Volume above its usual average (STOCK SCREENER)
- Trading above its 52-week high (STOCK SCREENER)
- Earnings within the next three weeks (STOCK SCREENER)
- Options are cheap right now (STOCK SCREENER)
- Elevated IV Rank for Premium Selling (STOCK SCREENER)
- Rich IV, Moving Less Than Priced (STOCK SCREENER)
- Rich premium with no earnings in the window (STOCK SCREENER)
- Making a new 52-week low (STOCK SCREENER)

**What the chart is showing** (7). *"Price and indicator setups read from each stock's own chart. They describe how a stock is moving, not why, so pair them with evidence from the other sections."*
- A tight range pressing the top of its bands
- Testing its 52-week high in a clean uptrend
- Resting on its trend as momentum turns up
- A new uptrend with money flowing in
- Momentum pushing into the upper band
- An uptrend with calls bought, not sold
- Rolling over below its trend
(all STOCK SCREENER)

**What gamma says about the move** (5). *"How option dealers are likely to hedge if the stock moves. Net gamma shows whether that hedging tends to dampen the move or amplify it."*
- Gamma flipped to the call side
- Gamma flipped to the put side
- Today's volume is setting gamma
- Calls dominate the gamma book
- Puts dominate the gamma book
(all STOCK SCREENER)

**Narrow your focus** (3). *"Not evidence on its own. Use these to keep every result inside the part of the market you actually trade."*
- Stocks with liquid options chains
- S&P 500 names only
- Mega-cap stocks only

**Your signals.** *"Signals you built from your own feed filters."* The only control is the card "Build your own signal: From a filtered feed link", which lets you paste any filtered UW feed URL and turn it into a signal. I did not use it.

**Total: 52 built-in signals across 6 groups, plus user-defined ones.**

### 2.3 Signal hover cards
Every card has an ⓘ "About …" popover with the same three-part structure: **what it is** (the exact rule, in plain English), **Why it matters**, and **Keep in mind** (the caveats). Examples, quoted in full:

**Executives buying with their own money** (INSIDER TRANSACTIONS)
- *What:* Company officers must file a Form 4 whenever they trade their own stock. This shows only open-market purchases and excludes the pre-scheduled 10b5-1 plans that execute automatically on a calendar.
- *Why it matters:* Executives sell for a hundred reasons: taxes, a new house, diversification. They buy for one: they think the stock is worth more than the price. An officer writing a personal check for shares is one of the cleanest signals in public filings.
- *Keep in mind:* Insiders can be early by a very long way, and small purchases are sometimes made for optics. Several officers buying at once means far more than one modest filing.

**One trade bigger than the whole contract** (OPTIONS FLOW)
- *What:* Open interest is the number of contracts that already exist. This reads the raw trade tape for single-leg call trades where one trade was larger than that entire number, was flagged as opening, and printed at or above the middle of the bid-ask spread.
- *Why it matters:* This is the cleanest read available on the tape. If only 800 contracts existed and someone just traded 3,000 of them at once, the trade cannot be anyone closing out. It has to be new. Every other options signal makes you argue about whether a position was opened or closed. This one does not.
- *Keep in mind:* A print at the ask is not proof of a purchase. Quotes lag fills, and a single enormous trade negotiated on the exchange floor is often a renegotiated block that leaves neither side genuinely long or short. Check how wide the bid-ask spread was before reading much into which side it hit.

**Crowded shorts, expensive to hold** (SHORT INTEREST SCREENER)
- *What:* Short interest as a percent of float shows how much of the tradable stock has been borrowed and sold. Borrow fees show what it costs to keep that bet open. This finds names that are high on both across trading dates in the past 14 days.
- *Why it matters:* This is fuel, not a reason to buy. If good news or heavy buying arrives in a heavily shorted, expensive-to-borrow stock, shorts are forced to cover into the move, which exaggerates the upside you were already expecting.
- *Keep in mind:* Plenty of stocks are heavily shorted for very good reasons. Never treat a squeeze setup as your thesis; use it to size up a move you already had evidence for.

**Gamma flipped to the call side** (STOCK SCREENER)
- *What:* (abridged) Net gamma on the open-interest book changed sign, moving upward from put-gamma dominance to call-gamma dominance, the regime in which dealer hedging tends to dampen volatility. Universe: market cap of at least $1B, average volume of at least 500K shares, price of at least $10, open interest of at least 50K contracts.
- *Why it matters:* A cross into positive net gamma marks the session when hedging pressure changed from amplifying moves to dampening them.

**Rich IV, Moving Less Than Priced** (STOCK SCREENER, the premium-selling setup)
- *What:* (abridged) IV in at least the 40th percentile of the past year, a positive variance risk premium, a price that moved less than one implied standard deviation last month, open interest of at least 100K, and no earnings in the next 50 days (ETFs and indexes stay in). Ranked by open interest.
- *Why it matters:* A positive variance risk premium means options priced a bigger move than the one that happened, which is the gap a premium seller collects.

**Stocks with liquid options chains** (STOCK SCREENER)
- *What:* A liquidity constraint rather than a signal. It keeps only stocks whose options trade heavily and already carry large open interest.
- *Why it matters:* In a thin chain the gap between the bid and the ask can cost you more than being wrong about direction. Liquid chains mean you get filled near fair value and, more importantly, that you can get out when you decide to.
- *Keep in mind:* Liquidity says nothing about whether a trade is a good idea. It only stops the mechanics from working against you.

---

## 3. "How it works": a 5-step modal tour

| Step | Heading | Copy (key text) |
|---|---|---|
| 1 | WELCOME TO TRADE FINDER: *Every Unusual Whales feed on one screen.* | "Stop switching between flow, dark pool, congress and insider pages, resetting filters and juggling windows. Trade Finder reads the feeds for you and brings what matters into a single ranked list." (The visual shows 5 feed tabs: Insider Transactions, Congress Trades, Dark Pool, Options Flow, Open Interest Changes, under the label "5 TABS · 5 SETS OF FILTERS".) |
| 2 | STEP 1 · PICK YOUR EVIDENCE: *Choose the signals you trust* | "Select up to 10 signals, including unusual options flow, dark pool prints, insider buys, congressional trades and more. Or start with a premade starter pack. We scan every one of those feeds at once, so you never set a filter twice." (The visual shows a "SIGNALS 0 / 10" picker.) |
| 3 | STEP 2 · FIND CONFLUENCE: *The strongest setups float to the top* | "Every stock is scored by how many of your signals it shows up in. Add a signal and the rankings update automatically. Stocks with the most independent evidence pointing the same way climb to the top." (The visual shows a ranked list with a "1/1" score badge on each row.) |
| 4 | STEP 3 · GO DEEPER, INSTANTLY: *From idea to research in one click* | "Open any stock to see which signals fired and the contracts behind them. From the row, save it to a watchlist, or jump into the overview, financials, seasonality, or a deep dive with Mr. Whale, all without leaving the page." (The visual shows "NVDA 3/3, EVERY SIGNAL AGREES" with a Save button.) |
| 5 | YOUR NEW EDGE: *Find trade ideas backed by multiple signals* | "Make it part of your premarket routine: pick your signals, see what's rising, and research the stocks where everything lines up." Three benefits: **Minutes, not hours** (no switching tabs or resetting filters), **More conviction** (stocks backed by more independent signals rise to the top), **Always fresh** (new flow and filings come in all day; watch the leaders change). CTA: "Find my next trade". |

The tour has a progress bar, a "Skip tour" link and an "N of 5" counter.

---

## 4. Results view (after "Find trades" or picking a pack)

### Layout
- **Left rail, the signal picker:** "SIGNALS 10 / 10" with a segmented progress bar, a **Clear** button, the helper text "Toggle any feed. The ranking updates as you add signals.", and a **Search signals** box. Below that is the full catalog grouped by section. Each section header shows how many of its signals are selected, and selected signals are highlighted with a numbered badge (1 to 10) and a check mark. Toggling a signal re-ranks the results live; there's no separate submit step.
- **Main panel:** "Trade Finder · How it works", the subtitle "Stocks ranked by how many of your signals they show up in.", and the total count at top right (for example "221 stocks").

### Ranking and grouping
The results are split into **tier headers** with a small dot meter, such as "●●●●●○○○○○ In 5 of 10 signals · 1 stock". When a stock matches every signal, the header reads **"Every signal agrees"**.

Tier distributions I observed:
| Pack | Signals | Total stocks | Tiers |
|---|---|---|---|
| Long call potential | 10 | 221 | 5/10: 1 (TSLA) · 4/10: 2 (SNDK, GEHC) · 3/10: 11 (MSFT, NVDA, PG…) · 2/10: 27 · 1/10: 180 |
| Put selling potential | 6 | 140 | 3/6: 3 (MU, SPY, MSFT) · 2/6: 29 (QQQ, SPX, META, SPXW…) · 1/6: 108 |
| Iron Condor Potential | 5 | 121 | **Every signal agrees: 1 (SPX)** · 4/5: 1 · 3/5: 11 · 2/5: 19 · 1/5: 89 |

The signals each pack selected:
- **Long call potential:** One trade bigger than the whole contract · A day's volume in a single burst · Out-of-the-money calls swept at the ask · The same trade, paying more each time · Unusual for this stock, not just large · Call open interest rising for a week · Options are cheap right now · Wall Street just raised the bar · Resting on its trend as momentum turns up · An uptrend with calls bought, not sold
- **Put selling potential:** Elevated IV Rank for Premium Selling · Confirmed Put Sell Activity · Smart Money Bid-Side Puts · OI Support on OTM Puts · Put Flow Alert Confluence · Institutional size off-exchange
- **Iron Condor Potential:** Rich IV, Moving Less Than Priced · Premium OTM Screen 25-50 DTE · Opening Multi-leg Flow · OI Built by Multi-leg Orders · Balanced OTM Alerts

### Row (collapsed)
- Ticker logo and **ticker**
- A list of the **signals it matched**, each with a small icon and the source feed tag (for example "Wall Street just raised the bar · ANALYST RATINGS")
- On the right: the **price** and the **% change today** (green or red), then the icons **expand ⌄**, **Save to a watchlist** (bookmark; it is filled blue when the ticker is already on a watchlist), and **Hide** (eye-off). The row's aria label states the evidence in full, for example "TSLA, matched 5 of 10 signals: One trade bigger than the whole contract, A day's volume in a single burst, …".
- No other columns: there's no score number, sector, market cap or premium column. The signal list *is* the evidence.

### Row (expanded): the evidence
Under **"SIGNALS IT MATCHED"**, each matched signal gets a block with:
1. The signal title and an **"Open feed ↗"** link, which opens the underlying UW feed in a new tab (/live-options-flow, /option-flow-alerts, /analysts, /stock-screener and so on) with the filter preset.
2. **Contract chips**, the specific contracts that triggered it, for example `TSLA $390 C 2027-04-16`, `TSLA $470 C 2026-11-20`; `MU $740 P 2026-11-27`.
3. The **plain-English rule** that was applied, for example: *"A sweep is an order split across several exchanges at once to fill as fast as possible. This keeps flow alerts from the past week on out-of-the-money calls that include a sweep, with at least 70 percent of the volume printed at or nearer the ask, at least $100,000 of premium, 14 to 90 days to expiry, and no multi-leg strategies… Results are ranked by premium, largest first."*

At the bottom of the expanded row is an action bar with 4 tiles:
- **Overview**: Price, stats, and company snapshot
- **Financials**: Revenue, earnings, and health
- **Seasonality**: Typical monthly and yearly patterns
- **Ask Mr. Whale**: Technicals, open interest, and conviction trades

### Refinement
- Signals can be toggled on and off in the left rail, with a hard cap of 10.
- **Notable behaviour:** adding the "Narrow your focus" constraint *Stocks with liquid options chains* to the Iron Condor pack **raised** the count from 121 to 144 stocks, and the denominator became "of 6 signals". Even though the copy calls these constraints "not evidence on its own", they are scored as one more signal rather than applied as a hard filter.
- Per-row **Hide** removes a ticker. There are no sort options, column filters or date-range controls; the time windows are built into each signal's rule.
- Clicking a pack card while results are showing (after Clear) replaces the selection and re-runs immediately.

---

## 5. Stock detail (TSLA, opened via "Overview" from the row)

The detail opens as a **large modal over the results** ("TSLA · Overview · Price, stats, and company snapshot") with an **"Open full page ↗"** button and a close ✕. Sections:
- **Intraday chart** with tabs *Options Vol / Avg Vol / Net Prem / Strikes / Stock*, a **Compare** button, ranges 1D, 1W, 1M, 3M, YTD, 1Y, 5Y and 10Y, and a header showing the day's options volume (3.31M), premium ($1.22B) and net premium ($12.65M), plus the day change (+$4.01, 1.00%) and post-market change.
- **Company blurb** (Tesla, Inc.…).
- **Key Stats** card:
  - VALUATION: Market Cap $1.60T, P/E 439.35
  - VOLUME: Stock Vol 43.1M vs Avg 40.9M, Stock Vol %ile 90d 78 (D8), Opt Vol %ile 90d 80 (D9), Put/Call 0.87
  - RANGE: Prev Close, Open, Day Low/High, 52W Low $297.38, 52W High $498.83
  - DATES: Div Yield, Ex-Div, Earnings 1/27/2027
  - FLOW: Net Prem $9.06M, Net Vol 226K, Call Prem $791M and Vol 1.77M, Put Prem $433M and Vol 1.54M, plus a 🐻/🐂 sentiment bar
- **Highest Volume Contracts** table (Chain, Last, Low-High, Volume, OI, Bid/Ask Vol %)
- **Highest OI Contracts** table
- **Shared Chains** (Added, Contract, Vol, OI, OI +/-, Bid/Ask)
- **Performance** chart (with Compare)
- **Daily GEX** (Price, call gamma, put gamma, net gamma)
- **Options & Off Lit Volume per Stock Price** (a volume-at-price ladder with the % of volume per $0.50 band)
- Analyst, dark pool, earnings and IV references further down

Financials, Seasonality and Ask Mr. Whale are sibling tiles, so the user stays on the Trade Finder page.

---

## 6. Mr. Whale Chat (`/ai`)

- Empty state: a whale avatar, "👋 Hi there! I'm Mr. Whale", and *"Your AI Market Analyst. Ask me about options flow, market data, insider trades, prediction markets, and more."*
- **TRY ASKING:** 4 suggestion cards, which rotate (for example "Which institutions recently increased their NVDA holdings?", "Find dark pool prints over $25M from the last trading session", "Find put contracts under 14 DTE with rising open interest and at least 1,000 prior open interest", "Show me recent multi-leg trades under 14 DTE excluding unrecognized strategies").
- **Browse prompts** opens a right-hand **Prompt Library** drawer. It has a *Bookmarked* section (the user's saved prompts) followed by 17 categories, each with a one-line description and a list of prompts: Options Flow · Multi-Leg Flow · Options Screeners · Open Interest Changes · Dashboards · Greeks · Dark Pool · Stock Discovery · Price Action And Technicals · Earnings, Analysts, And Fundamentals · Institutions, Insiders, And Politics · Market Overview And Macro · Crypto · Prediction Markets · Watchlists And Personal Workflows · Backtests And Strategy Ideas · Custom Notifications.
- Composer: a "+" attach button, the placeholder "Ask about markets, options flow, stocks…", a model selector ("Mako"; it's locked to the plan and shows the toast "Your plan grants you complimentary usage credit to Mr. Whale. To increase your access, click here"), and send. Disclaimer: "Mr. Whale is AI and can make mistakes. Please double-check responses."
- Header actions once a conversation exists: **+ New**, **History** (clock), **Settings** (gear), **Share**. A "Check out Automations (BETA)" promo sits at top left.

**One test question.** I clicked a suggestion card, but the suggestions had rotated, so what got sent was *"Show me companies with improving cash flow and bullish options activity"*. The answer format:
1. A live **tool-step chip** while it works ("Form Market Map · thinking · N tools · 33s").
2. **Transparent scoping:** "My strict cash-flow improvement screen did not return matches, so I can only confidently show the bullish flow candidates right now."
3. **"Best bullish-flow candidates"**: a table with columns Ticker (clickable chip with logo), Sector, Call NP, Put NP and **Read** (a one-line plain-English take, for example "Very call-heavy, cleaner than most" or "Bullish, but mixed tape underneath") covering 10 names (DE, GXO, SCHW, GPN, MGM, WAY, PATH, SG, VFC, ZTS).
4. **"Quick take"**: a shortlist (DE, GXO, WAY, PATH) with the reasoning behind it.
5. **"Market map"**: it states the filter it used (common stocks only, bullish % of at least 60%, call volume of at least 1,000, net premium of at least $100K), the axis definitions and why the chart is useful, then embeds an **interactive Bubble/Treemap chart** with axis selectors.
6. **Follow-up QUESTION suggestions** (3 numbered prompts, such as "Rank these bullish-flow names by cleanest options positioning…").
7. A **"3 Sources"** pill and bookmark/copy icons on the user's message.

---

## 7. Automations (`/ai/tasks`, BETA)

**"Create an Automation"** offers 4 type cards, each with 3 example prompts:
| Type | Description | Example prompts |
|---|---|---|
| Newsletter | A recurring recap, written for you and delivered on your schedule. | Daily market overview incl. most active stocks · Newsletter for my watchlist stocks and major news · Premarket report at open with global news |
| Research | One-time deep dive on a ticker or theme. Produces a full report. | Deep dive on NVDA's past 5 years of earnings and disclosures · Bull and bear case for TSLA and which the data supports · Mixed 50-stock portfolio with high growth potential |
| Feed Monitor | Watches live feeds and alerts you when something matches. | Tell me when a watchlist stock makes a large move and why · Alert when a politician buys or sells a stock I follow · Watch for large sweeps on my watchlist and summarize |
| Scheduled Run | Runs any request at the times and days you choose. | Every morning before open, summarize overnight news for my watchlist · Create or update a high-volatility watchlist · Daily close market wrap-up |

**"My Automations"** is a list of rows with a status pill (COMPLETED), a name and a date. This account has two past research runs ("Fundamentally Strong Stocks", 2026-08-28, and "STRSI"). Opening one shows: Back, **Open in chat**, Delete, NAME, INSTRUCTIONS (the original prompt, for example "Find top 25 S&P 500 fundamentally strong stocks using CANSLIM Model."), a callout ("Continue this research in a Mr. Whale conversation… Import this report into a chat to ask follow-up questions"), and then a long-form **MR. WHALE RESEARCH** report (date, title, Executive Summary & Investment Thesis… with honest notes about data limitations). I didn't create, edit or delete anything.

---

## 8. Takeaways for HK ELI Chatbot (sales tool)

1. **Confluence, not a black-box score.** Ranking by "how many independent signals agree" (N of M) is simple to explain, and it builds trust. For ELI it could mean ranking prospects or accounts by how many buying signals line up (for example engagement, budget cycle, a trigger event, fit, an intent spike), shown as "In 4 of 6 signals" tiers.
2. **Signals written as plain-English questions, with the source tag kept.** Group them by the question a rep asks ("Who is actually buying", "What could push the deal") rather than by data source, and keep a small tag for provenance.
3. **A three-part explainer on every signal** (what it is, why it matters, keep in mind). The caveats in "Keep in mind" are what make the tool feel honest. Copy the pattern directly.
4. **Starter packs** framed around intent or strategy (for example "Upsell potential", "Renewal at risk", "Net-new in a buying window") let a novice get a result with one click, while power users can still hand-pick up to N signals.
5. **Evidence in the row:** every match lists the concrete records behind it (the contract chips, which for ELI could be the actual email, meeting or CRM event), an "Open feed" link to the source system, and the exact rule applied. Nothing has to be taken on faith.
6. **One-click deepen:** the row's action bar (Overview / Financials / Seasonality / **Ask Mr. Whale**) hands the selected entity straight to the chat assistant. ELI could do the same with "Ask ELI about this account".
7. **Live refinement** with a toggle-and-rerank rail, a cap of 10 signals, Clear, and a signal search box. There's no submit step.
8. **Chat answer pattern worth copying:** tool-progress chip, then an honest scoping note when a screen comes back empty, then a table with a one-line "Read" per row, then a Quick take, then an embedded interactive chart that states the exact filters used, then 3 follow-up suggestions, then a sources pill.
9. **Automations** (Newsletter / Research / Feed Monitor / Scheduled Run) map neatly onto sales needs: a daily pipeline digest, an account deep-dive, a trigger-event monitor and a scheduled report. Being able to import a finished report back into chat for follow-ups is a nice touch.
10. **One thing not to copy:** "Narrow your focus" constraints are counted as signals, which inflates the result count and dilutes the N of M score. In ELI, apply constraints like territory, segment or region as **hard filters** that are kept separate from the evidence count.

---
*Read-only session. I changed no settings, created no automations, alerts or watchlists, made no purchases and entered no personal data. Side effects: one Mr. Whale chat message (one complimentary-credit conversation now exists in the history), and Trade Finder's on-page signal selection was left on the Iron Condor pack plus the liquidity constraint, which is local UI state only.*

---

## 9. Deep dive: Mr. Whale Automations (BETA), follow-up review on 2026-11-03

Read-only. I opened the create flow for each type and changed fields only to see how the form reacts. I never pressed **Create Automation**, and nothing was saved, run, edited or deleted.

### 9.1 Entry points
- **`/ai/tasks` landing page:** "Create an Automation · BETA" shows 4 type cards in a 2×2 grid, each with 3 example prompts under it (💡). Below that is **My Automations**.
- **The example prompts are deep links.** Each one opens `/ai/tasks/create` with `work_type`, `prompt` and `name` already set in the URL. For example, "Tell me when a stock on my watchlist makes a large move and why" opens Feed Monitor with Name **"Unusual Move Monitor"** and the instructions filled in. Creating one takes a single click plus a review of the form.
- There's a "Check out Automations (BETA): Automate research, monitoring & more →" promo banner at the top left of Mr. Whale Chat.
- **I didn't see any direct link from Trade Finder** (no "monitor these signals" or "schedule this pack" button). Trade Finder connects to Mr. Whale only through the row's **Ask Mr. Whale** tile. Automations are written in free text, so a user would have to describe the signals in words.

### 9.2 The create form (`/ai/tasks/create`), one page for all types
It's a single card. The fields shown change with the selected type, and the type can be switched without losing the Name or Instructions.

| Field | Newsletter | Research | Feed Monitor | Scheduled Run |
|---|---|---|---|---|
| **Automation Type*** (4 selectable cards) | ✓ | ✓ | ✓ | ✓ |
| **Research Template** (optional, single select) | – | ✓ 12 chips | – | – |
| **Name*** "A short name for this Automation." (placeholder "e.g. Morning Watchlist Recap") | ✓ | ✓ | ✓ | ✓ |
| **Instructions*** "Your instructions and details. Include relevant tickers and any specifics." (multi-line) | ✓ | ✓ | ✓ | ✓ |
| **Schedule** (time) | ✓ "When this Automation should run." | – | – | ✓ "Scheduled Time*" |
| **Day of Week** "Which day(s) it should run." | ✓ | – | – | ✓ |
| **Delivery toggle** | **Email Alerts**: "Deliver results to your email inbox." (on by default) | – (report in app) | **Push Alerts**: "Send results as mobile push notifications." (on by default) | – (no toggle) |
| **Live summary line** | ✓ | ✓ | ✓ | ✓ |
| Buttons | Cancel · Create Automation | same | same | same |

**Instructions placeholder for each type (these show the intended use):**
- Newsletter: "Every weekday morning, recap my watchlist: price moves, notable options flow, analyst changes, and any earnings due this week."
- Research: "Deep dive on NVDA: last 5 years of earnings, guidance vs. results, insider activity, and the current bull/bear setup."
- Feed Monitor: "Alert me when any stock on my watchlist moves more than 5% intraday, or when a politician trades a name I follow."
- Scheduled Run: "Every day at market close, give me a wrap-up: index performance, biggest movers, and anything unusual in options flow."

**The schedule control** (Newsletter and Scheduled Run):
- A **24-hour timeline slider** (0 to 1439 minutes, in 5-minute steps) with a time bubble above the handle and two snap markers, **Market Open** (9:30) and **Market Close** (4:00 PM).
- Below the slider, the time can also be set with hour and minute pickers, an **AM/PM** toggle and a **timezone** combobox (default America/New_York). The timezone list is the full searchable IANA list.
- Defaults: Newsletter is 4:00 PM (market close) on **All Days**. Scheduled Run is **9:00 AM** on All Days.
- **Day of Week** has presets **Weekdays** and **All Days**, or individual Mon to Sun chips (multi-select).
- You get one time per automation. I saw no "add another time" option, interval (hourly) option or end date.

**Research templates (12):** Generic (default) · Technical Strategy · Portfolio · Macro Strategy · Fundamentals · Earnings Overreaction · Equity Breakout · Insider Audit · Retail Sentiment · Bull vs. Bear Case · Base Case & Risk · Earnings & Events. Picking one doesn't change the instructions or placeholder; it's a hidden "lens" passed to the research agent. Hovering shows no description; the aria label is just "insider audit research".

**The live summary line**, a plain-English confirmation that updates as you change fields:
- Newsletter default: "Delivers a newsletter **every day at market close** to **your email inbox**."
- After choosing Weekdays and Market Open: "Delivers a newsletter every weekday at market open to your email inbox."
- With Email toggled off: "Generates a newsletter every weekday at market open." (So it still runs and the result stays in the app.)
- Research: "Runs once and delivers a full research report you can ask follow-ups about."
- Feed Monitor: "Watches your feeds around the clock and alerts you with a push notification the moment something matches." With push off, this becomes "…alerts you the moment something matches."
- Scheduled Run: "Runs every day at 9:00 AM (America/New_York) and sends you the result."

**What the form doesn't have:**
- No structured **trigger or condition builder** for Feed Monitor. There's no feed picker, threshold field or ticker picker; the condition is written in the free-text instructions and the agent interprets it.
- No **data-source selector**. Sources are implied ("my watchlist", "politician", "options sweeps").
- Delivery is limited: **email** for Newsletter and **mobile push** for Feed Monitor. I saw **no Discord, Slack, SMS or webhook** option, no **recipient list** (email goes to the account owner only) and no CC.
- No **preview or test run** before saving, and no "run now".
- No **credit, quota or limit** shown in the form. The only usage hint anywhere is the Chat toast: "Your plan grants you complimentary usage credit to Mr. Whale. To increase your access, click here."
- Validation: Name and Instructions are marked required (*). I didn't submit to see the error messages.

### 9.3 Management screen ("My Automations")
- Each row has a type icon (flask for Research), a **status pill** (all current rows show **COMPLETED** in green), the **name**, the **date**, and a **⋯ "Automation actions"** menu.
- For completed Research rows, the menu has only **Delete** (in red). There's no edit, pause, duplicate or re-run option for these. I didn't see Active or Paused states because this account has no recurring automations; I'd expect pause and edit to appear for Newsletter, Feed Monitor and Scheduled Run, but couldn't confirm it.
- **No history or runs list** per automation was visible. A Research automation is a single run.
- **Error state:** an unknown automation ID shows "← Back to Automations · Automation not found." (it's minimal).
- **Empty state:** this account has 2 automations, so I didn't see it. The 4 type cards with their example prompts double as the onboarding.

### 9.4 Report pages (opened 2 past Research runs in full)
Both use the same layout at `/ai/tasks/view/<id>`:
1. **Header:** "← Back to Automations", "My Automation", and **Open in chat** and **Delete** at top right.
2. **Metadata block:** NAME, then INSTRUCTIONS (the user's original prompt, shown verbatim).
3. **Follow-up callout:** "Continue this research in a Mr. Whale conversation. Import this report into a chat to ask follow-up questions and dig deeper." with an **Open in chat** button. (I didn't click it, because it would create a conversation.)
4. A **MR. WHALE RESEARCH** label, the run date, and an **H1 title** the agent writes itself (it is not the user's name for the automation).
5. A long-form markdown body (about 14k characters each) with H2 and H3 sections, markdown tables and bold callouts. **Every ticker is linked** to `/stock/<TICKER>`. There's at most one external link (S&P Global). There are **no charts** and **no formal Sources or citations section** (unlike Chat answers, which show a "3 Sources" pill).

**Report A: "Fundamentally Strong Stocks"** (Research, 2026-08-28). Instructions: "Find top 25 S&P 500 fundamentally strong stocks using CANSLIM Model."
Title: *Top 25 S&P 500 Fundamentally Strong Stocks Using a CANSLIM Proxy Model*.
Sections: Executive Summary & Investment Thesis → Macroeconomic & Industry Backdrop (market regime, the M factor, sector implications) → Business Model & Competitive Moat → CANSLIM Proxy Framework Used (one H3 per letter: C, A, N, S, L, I, M) → Financial Health & Valuation Analysis (**Data limitations**, what "fundamentally strong" means here, valuation, DCF note) → Top 25 S&P 500 CANSLIM Proxy Candidates (**25-row table: Rank / Ticker / Sector / CANSLIM View / Key rationale**, for example "1 · NVDA · Tech · Buy · Clear earnings catalyst, AI leadership, elite relative strength", followed by an "Important qualification") → Why These Names Rise to the Top (a Theme / Why it fits table) → Sector and Index Construction Notes → Key Risks & Mitigations → Final Investment Conclusion (tiers: Buy on strength / Avoid). It closes by saying plainly that it is "a proxy-ranked research report, not a fully exhaustive quantitative screen".

**Report B: "ST+RSI"** (Research, 2026-08-27). The instructions are a multi-line technical spec: "Find stocks setting up for a breakout with unusual options activity · Use Daily or 4H timeframe · SuperTrend must be bullish and price action candle is above the super trend · RSI must be crossing 60".
Title: *Breakout Candidates With Unusual Options Activity* (subtitle "Mr. Whale Research Note").
Sections: Screening Framework (it restates the universe, liquidity thresholds and rules it applied) → Best-Validated Names (**table: Ticker / TF / ST Bull / Px > ST / RSI 60 Cross / UOA Evidence / Status**, 6 rows) → Market Structure & Liquidity Profile → Options Architecture & Volatility Landscape (**an expiry table: Call Vol / Put Vol / Call Prem / Put Prem**, plus a **contract table: Ticker / Contract / Prem / Vol / OI / Rule / Sweep**) → one deep dive per name ("1) SPY: strongest unusual options confirmation", "2) NVDA: best single-stock 4H technical confirmation", "3) AAPL: 4H setup confirmed, Daily not confirmed", "4) KSS: technically valid but lower-conviction…") → Gamma & Delta Positioning → Technical Setup & Trend Confluence (core formula, candidate-by-candidate read) → Catalyst & Event Risk Overlay (**Ticker / Event / Timing / Exp Move / Read-through** table) → Tactical Execution Blueprint (Tier 1 to Tier 4) → Final Ranking (**Rank / Ticker / Thesis**) → Bottom Line.

**Patterns across both reports:** the agent restates the framework it applied, says honestly which rules were and weren't confirmed (for example "4H confirmed, Daily not confirmed"), ranks into tiers by conviction, puts the evidence in tables, and ends with a short conclusion. Each run is a fixed snapshot with no refresh, and follow-up happens by importing the report into Chat.

### 9.5 How Automations connect to the rest of the product
- **Chat ⇄ Automations:** you can import a report into Chat ("Open in chat"). The Prompt Library in Chat also has a "Custom Notifications" category and a "Watchlists And Personal Workflows" category, so the same agent and data sit behind both.
- **Watchlists** are the main subject for Newsletter and Feed Monitor ("my watchlist" appears in 5 of the 12 example prompts). In Trade Finder, the row's "Save to watchlist" is therefore the bridge: what you save there gets picked up by watchlist-based automations.
- **Trade Finder signals are not reusable inside Automations.** There's no "watch this pack" option; the condition has to be retyped as prose.

### 9.6 HK ELI takeaways (mapped to our three features)

**A. Scheduled Business Update** (≈ UW Newsletter or Scheduled Run)
- Copy the **single-page form with a type switcher** and the **live plain-English summary line** ("Delivers a Business Update every weekday at 8:00 AM IST to your email inbox."). It acts as the confirmation step and catches mistakes before saving.
- Copy the **timeline slider with business-anchored snap points**. For HK ELI these would be **branch open, RM huddle and EOD cut-off** instead of market open and close, plus Weekdays / All Days / day chips and an explicit timezone (default to the user's own, such as Asia/Kolkata).
- Improve on UW: add **multiple recipients** (RM, team lead, cluster head), **channel choice** (email, Teams/Slack, in-app), a **"Preview / Send me a test now"** button, and a run **history** with pause and edit. UW has none of these.
- Keep the report structure: Executive summary → KPI tables → drivers → risks → "what to do next" tiers → "Open in chat" for follow-ups. Add charts, which UW reports lack, and a **Sources / data-as-of footer**.

**B. Threshold alerts** (≈ UW Feed Monitor)
- UW's free-text condition is quick to set up but hard to audit. For HK ELI, **parse the free text into a structured, editable rule** (metric, operator, threshold, scope, window) and show it back as chips, for example "AUM drop > 10% · my book · 1 day". This works the way Trade Finder's signal hover cards state each rule.
- Reuse **Trade Finder-style signals as alert triggers**, which closes the gap UW leaves: "Alert me when any of my accounts enters ≥ 3 of these 6 signals." Confluence alerts cut noise compared with single-metric alerts.
- Delivery: push or in-app by default, with **email or Teams as options**, **quiet hours**, and a **digest vs. instant** choice. Each alert should carry the evidence (the records that triggered it) and an **Ask ELI** button, just like the Trade Finder row.

**C. Morning RM digest** (≈ UW Newsletter at "Market Open" with the watchlist as subject)
- Use the **RM's book or portfolio as the "watchlist"**, the same way UW keys most automations to the user's watchlist.
- Ship **3 to 4 one-click example prompts** that deep-link into a pre-filled form (UW's `work_type`, `prompt` and `name` pattern), such as "Daily 8:30 AM: my top 10 accounts by risk change, renewals due this week, and any trigger events". Default it to **Weekdays · pre-huddle time · email + in-app**.
- Digest structure: **"Top signals today" grouped into N-of-M tiers** (Trade Finder style), then per-account evidence chips, then suggested next actions, then follow-up questions, then "Open in ELI chat".
- Learn from UW's gaps: show **usage limits or credits** up front, offer a **test send**, allow **pause and edit** on recurring jobs, and give a useful **empty state** ("No accounts crossed a threshold today, here's what was checked"), not just "not found".

### 9.7 "Open in chat" handoff (tested 2026-11-03 with the product lead's OK)
- I opened the **ST+RSI** report and pressed **Open in chat**. It went straight to Mr. Whale Chat (`/ai` with a new `conversation_id`), with no confirmation step and no new tab.
- The new conversation opens with **one bubble: "What questions do you have about the research paper?"** That message is already in the thread when it opens, and below it are the usual message actions (copy, 👍/👎, retry, ⋯). The cursor is in the normal composer ("Ask about markets, options flow, stocks…"), and the model (Mako) and the complimentary-credit toast are unchanged.
- **The report itself isn't shown** in the chat. There's no attachment chip, title card or link back to the automation. It's loaded as hidden context, and the only hint is the words "research paper". I didn't send a follow-up, so I haven't confirmed how well the agent uses that context.
- This creates a conversation in Chat history (that's the only side effect; no message was sent).

- **Follow-up test (with the product lead's OK):** I asked "Summarize the report in 3 bullets: which tickers made the final ranking and why?" The answer **matched the report exactly**, without re-running any screens:
  1. SPY ranked highest because of the best overlap of confirmed 4H breakout technicals with real unusual options activity (repeated-hit flow, heavy front-expiry premium).
  2. NVDA, AAPL and KSS followed, in that order: NVDA had the strongest single-stock 4H breakout but event and earnings risk; AAPL had a clean setup but weaker flow; KSS qualified but had the weakest supporting evidence.
  3. Big picture: the report favoured 4H setups over Daily, and confirmation by flow drove the ranking.

  So the hidden report context **does carry into the chat** and is used accurately. The user just can't see that it's there. This was the 2nd message I sent in Mr. Whale during the review.

**HK ELI takeaway:** the "continue in chat" handoff is the right idea, so a digest or Business Update should drop the user into a chat that already knows the report. Improve on UW in three ways:
1. Show a visible **context chip** with the report's title, date and a link back.
2. Replace the generic opener with **3 report-specific suggested follow-ups**, such as "Why did account X drop?" or "Draft an email to the top-3 at-risk clients".
3. Keep the thread **linked to the scheduled job**, so the next run can say "since yesterday's update…".

---

## 10. Existing scheduled items, custom alerts and custom signals (2026-11-03)

### 10.1 What's already set up in the account (read-only check)
- **Automations (`/ai/tasks`):** only the 2 completed one-off Research runs (CANSLIM and ST+RSI). There are **no recurring Newsletter, Feed Monitor or Scheduled Run automations**, so I couldn't observe pause, edit or run history for those types from existing data.
- **Custom Alerts (`/custom-alerts`, opened from the nav "Alerts")** is UW's older, rule-based threshold-alert product, and it has **6 active alerts**. It's the closest real-world reference for HK ELI threshold alerts:

| Alert | Type | Rule (as shown) | Matches |
|---|---|---|---|
| GHOST_CONTRACT_UW | Contract alert | volume > 250 and open_int < 5 and premium > 2000 and premium < 50000 and price < 0.5… | 462 |
| Stock Volume or Unusual Volume | Stock alert | Min Intraday Change, Min 30D Stock/Volume Ratio, All symbols | 556 |
| Flow alerts for All | Flow alerts | all_opening and askside and calls and dte < 90 and dte > 14 and premium > 500000 and size_greater_oi | 4 |
| Hot Contract - Ask Side | Contract alert | 14 filters | ~1.7K |
| Unusual Stock Volume | Stock alert | Issue Types, Min 30D Avg Stock Volume, Min Market Cap, Min Stock Price, Min 30D Stock/Vol… | 0 (status dot red) |
| Contract alert for SPX | Contract alert | 15 filters | 0 |

**Page layout:**
- Tabs **Feed** (one combined stream of every alert hit) and **Active [6]** (the rules), plus a **Create Alert** button and "Get push alerts on mobile: Android / iOS" links. Push delivery requires the mobile app.
- The Feed tab has sub-tabs *My Alerts / Preset Alerts* and *All [50] / Options [21] / Stocks [29]*, a ticker search, filter and settings. Each hit is one dense row: time, CONTRACT or STOCK chip, ticker, strike and expiry, a bid/ask bar, %OTM, volume, OI, multi-leg %, average fill, total premium, and on the right the **name of the alert that fired** (e.g. "GHOST_CONTRACT_UW", "Hot Contract - Ask Side").
- The Active tab has a **"Most Matched · Last 3d"** ticker strip across the top, then one row per alert. Each row shows: checkbox (with Select all, for bulk actions), name, the rule summary in grey, the **most recent matching tickers as chips with ×count**, the **match count with a sparkline**, the type label, a **status dot** (green active, red inactive or erroring), and the actions **Filter details · Share alert · Edit alert · Delete alert**. There's also Show details (expand), **Filter by alert type** and **Sort list**.

**Details modal** (Filter details): title, an **Active** status pill, FILTER (the full rule expression), CREATED date, **EMAIL: Disabled** (so email is a per-alert setting), the buttons **Edit · Duplicate · Delete**, and a **"Share filter" URL with a Copy button** (rules can be shared as links).

**Alert builder** (`/custom-alerts/create`, which Edit also opens; I looked and pressed Cancel without saving) has **four ways to define a rule:**
1. **Templates**
2. **Visual Builder**
3. **Formula** (a typed expression such as `all_opening and askside and calls and dte <= 90 …`, with "Help & Examples" and a FIELDS reference)
4. **Ask Mr Whale** (describe it in natural language)

It also has TYPE (e.g. Flow Alert), NAME, Cancel and Save. While editing, the mode stayed on Formula.

### 10.2 Trade Finder "Build your own signal" flow
Opened from "Your signals → Build your own signal". It's a modal titled **"CUSTOM SIGNAL · Turn your saved filters into a signal"**, with the copy: "Pick a feed, then one of the filters you've saved there. Trade Finder reruns those filters every time it ranks."

**Step 1, PICK YOUR FILTERS.** There are two modes:
- **Use a saved filter** (the default): feed chips for Options Flow · Flow Alerts · Options Screener · Open Interest Changes · Dark Pool · Insider Transactions · Congress Trades · Stock Screener · Analyst Ratings. Picking a feed lists the filters you've saved there. For Options Flow it showed **"UW11 · 9 filters"**, plus the hint "Don't see it? Save a new filter on Options Flow and it appears here."
- **Paste a link instead:** a URL field (placeholder `unusualwhales.com/live-options-flow?min_premium=…`) with the hint "Works with these feeds: open one, set your filters, then copy the URL." I pasted `…/live-options-flow?min_premium=1000000`, and it immediately parsed a **preview card: "Options Flow ✓ · 1 filter from your link · Min premium 1.00M"**. The URL parameters are decoded into readable filter chips.

**Step 2, NAME IT.** The name is pre-filled as **"My Options Flow signal"**, with a 22/80 character counter and the placeholder "What does this signal catch?". Below it is an **icon picker with about 20 glyphs**.

Footer: "It joins 'Your signals' in the list on the left." with **Cancel** and **Create signal** buttons.

**Product lead then approved the test directly. Created, explored and deleted on 2026-11-03.**
- **Create:** I pasted `…/live-options-flow?min_premium=1000000`, renamed the signal to "HK ELI test - delete", kept the default icon and pressed Create signal. The modal closed, and the signal was **auto-selected**: the Find trades button showed a "1" badge.
- **How it appears:** "Your signals" changes from the bare "Build your own signal" card to a header reading **"1 picked · Manage"**. The signal card shows the name, a **NEW** badge and the source tag **OPTIONS FLOW**.
- **Hover card:** it's generated automatically from the filters, e.g. "Your Options Flow filters — Min premium: 1.00M." There is **no "Why it matters" or "Keep in mind"** like the built-in signals have. The user can't add their own explanation.
- **Results with only this signal:** "7 stocks" and an empty-state hint: **"Add another signal to find overlap. Stocks that show up in more than one of your signals move to the top. That's where the strongest ideas are."** The rows look exactly like the built-in ones. SPX's evidence lists 9 qualifying contracts as chips (e.g. `SPX $7,525 C 2026-12-18`), the auto-generated description, an **Open feed** link, and the Overview / Financials / Seasonality / Ask Mr. Whale tiles.
- **Scoring:** I added the built-in "Out-of-the-money calls swept at the ask" and got 36 stocks, all "In 1 of 2 signals" (no overlap that day). A **custom signal counts as one vote, the same as a built-in signal**.
- **Manage** (modal "CUSTOM SIGNALS · Your signals: Rename a signal, point it at new filters, or clear out the ones you've outgrown"): one row per signal ("HK ELI test - delete · OPTIONS FLOW · 1 filter") with **Edit** and a trash icon, a "1 signal" count and a **New signal** button.
  - **Edit** ("EDIT SIGNAL · Tune 'HK ELI test - delete' … Your ranking picks up the change right away") reuses the create form: pick a filter or paste a link, rename, change the icon (about 20 icons: zap, crosshair, trending up, activity, layers, bar chart, pie chart, briefcase, users, anchor, award, tag, calendar, droplet, shield, filter, alert triangle, wind…). The footer reads "It keeps its place in your selected signals" with **Cancel** and **Save changes**.
  - **Delete** shows an inline confirmation, **"Delete this signal? It also leaves your ranking." Keep it / Delete**. Afterwards the empty state reads **"No custom signals yet. Pick one of your saved feed filters and it ranks right alongside the built-in signals. Nothing saved yet."**
- ✅ **Deleted.** After a reload, "Your signals" shows only "Build your own signal" again.

### 10.2b Test recurring automation (created, explored and deleted on 2026-11-03)
- **Created** a Newsletter named "HK ELI test - delete" with the instructions "Test only, will be deleted. Short recap of SPY price move.", **Weekdays**, 4:00 PM (Market Close) America/New_York, and **Email Alerts OFF**. The summary line read "Generates a newsletter every weekday at market close." There was **no confirmation or preview step**: pressing Create went straight back to `/ai/tasks`.
- **List row:** a newspaper icon (the type), a blue **ACTIVE** pill, an inline **⏸ Pause** button, the name (**automatically title-cased** to "HK ELI Test - Delete"), the created date and a ⋯ menu. The ⋯ menu offers **only Delete**.
- **Detail page** (`/ai/tasks/view/<id>`):
  - Left card ("My Automation"): **Pause** and **Delete** buttons, NAME, INSTRUCTIONS with a ✏️ **Edit instructions** button, SCHEDULE ("Market Close") and DAY OF WEEK ("Weekdays").
  - The email setting is **not shown** after creation.
  - Right panel, the run history, is empty: a newspaper icon and **"No newsletters yet. This Automation hasn't sent any newsletters yet. They'll show up here once it runs."** with a **"Send me one right now"** (run now) button. I didn't press it, so as not to use credits.
- **Pause:** one click. The button changes to **▶ Unpause**, and the list pill changes to a grey **PAUSED** with an inline ▶ unpause button. No confirmation is asked.
- **Edit:** **only the instructions** can be edited, inline in a textarea with Save changes / Cancel. **The name, schedule, days, timezone and email can't be edited after creation**; to change those you'd have to delete and recreate.
- **No credits or usage are shown anywhere**, and there's no next-run time ("next run: Mon 4:00 PM").
- **Delete:** ⋯ → Delete shows an inline confirmation on the row, **"Delete this Automation? Confirm / Cancel"**.
- ✅ **Deleted.** After a reload, My Automations shows only the 2 original completed research runs.

**Final state:** both test items are deleted, and the 6 Custom Alerts and 2 completed research runs are unchanged. The only trace of this session in your account is the 2 Mr. Whale conversations mentioned earlier.

### 10.3 HK ELI takeaways from this
- **Two alert products side by side:**
  - The structured **Custom Alerts** (rule, match count, sparkline, status, email per alert, share link, duplicate, bulk select) is the right model for **auditable threshold alerts**.
  - The free-text **Feed Monitor** automation is the easy on-ramp.
  - HK ELI should **merge them**: let the user describe the alert in words (the "Ask Mr Whale" mode), then show the **parsed rule** (the Formula / Visual Builder view) for confirmation, then keep it as a structured rule.
- **Rule rows that show value right away:** recent matching entities as chips with ×count, a match count with a 3-day sparkline, and a red or green health dot. For HK ELI this becomes something like "AUM drop > 10% · 7 accounts matched this week ▂▅▇ · ●".
- **"Most matched (last 3 days)" strip:** in an RM digest, show the accounts that tripped the most alerts across all rules.
- **Turn saved views into signals.** UW lets any saved feed filter, or a pasted filtered URL, become a ranking signal, with an instant readable preview ("1 filter · Min premium 1.00M"). HK ELI could let an RM turn any saved CRM or report view into a signal for the confluence ranking and the morning digest.
- **Per-alert delivery settings** (email on or off, push through the app) plus **shareable rule links**, so a team lead can share an alert rule with RMs.
- **Learned from the test items:**
  - **Show "next run" and the delivery status** on every scheduled job (UW shows neither).
  - Make **everything editable** after creation, including schedule, recipients and channel. UW only allows editing the instructions.
  - Make **pause and resume one click**, with a clear PAUSED state in the list.
  - Show the **run history in the same page** as the settings, with a useful empty state and a "send me one now" button. **Show the cost or credit** before a manual run.
  - Make **custom signals first-class**: let users add their own "why it matters" note, because UW's custom signals lose the explanations that make the built-in ones trustworthy.
  - Use **inline delete confirmations** that say what else will change ("It also leaves your ranking").
