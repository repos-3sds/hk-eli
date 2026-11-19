# Connect the POC to a real Tableau site (Tableau Cloud trial)

The POC embeds real Tableau views with the Embedding API v3 (`<tableau-viz>`) and reads their
numbers with REST Query View Data, both signed in through a Connected App as one Tableau user.
This guide sets up a Tableau Cloud trial with the POC's synthetic HK ELI data.

You do steps 1 to 4 once (about 45 minutes, most of it building sheets). Steps 5 and 6 run the POC.

## 1. Start the trial

On tableau.com choose **Try for free → Tableau Cloud**. Note two parts of the address once your site
opens, e.g. `https://prod-apsoutheast-a.online.tableau.com/#/site/hkelipoc/home`:
- **server** = `https://prod-apsoutheast-a.online.tableau.com`
- **site** = `hkelipoc`

## 2. Create the Connected App

**Settings → Connected Apps → New Connected App → Direct trust.**
- Name: `hk-eli-poc`. Access level: all projects.
- **Domain allowlist:** "All domains" for the trial, or `*.app.github.dev` and `localhost` for Codespaces and local runs.
- Create, then **Generate new secret** and **Enable**.

Keep the **Client ID**, **Secret ID** and **Secret value**. Never paste them into chat or commit them.

## 3. Upload the data

Download `hk_eli_positions.csv` (in the project files under `hk-eli-poc/`, or run
`python scripts/export_tableau_data.py out/hk_eli_positions.csv`).

**Explore → New → Workbook from file upload**, upload the CSV. Tableau shows the columns with captions
like `Cust District`, `Volume Bu`, `In N30`: keep those names, the POC uses them.

In the data pane, set the type of `In N7`, `In N14`, `In N30`, `In N60`, `In N90` to **String**
(so their values are exactly `TRUE`/`FALSE`), and make `Predict Maturity`, `Business Date` dates.

Create these calculated fields:

| Name | Formula | Used by |
|---|---|---|
| `Share Of All Segments` | `SUM([Volume Bu]) / SUM({FIXED : SUM([Volume Bu])})` | sheets 2, 3 (W5) |
| `Customers (all results)` | `{EXCLUDE [Predict Result] : COUNTD([Cif Id])}` | sheets 5, 6, 8 (W7) |
| `MTM% (bin)` | right-click `Wps Mtm` → Create → Bins, size 5, then rename | sheet 11 |

## 4. Build the sheets

Name each sheet exactly as shown (no `#`). Put every field below on **Rows/Columns/Marks**, not in
*Measure Values*, so the data export has one column per field. "Filter (shown)" means drag it to
Filters and choose **Show Filter**, so the embed can set it. "Context" means right-click the filter
→ Add to Context, so FIXED and EXCLUDE calculations respect it (W4/W5).

| # | Sheet name | Build | Filters |
|---|---|---|---|
| 1 | `all_outatanding_total` | Text: SUM(Volume Bu) | Deal Status (shown), Bp Div Type (shown) |
| 2 | `all_outatanding_segment` | Rows: Bp Div Type. Columns: SUM(Volume Bu). Label: Share Of All Segments | Deal Status = LIVE (context, shown), Bp Div Type (shown) |
| 3 | `all_outatanding_segment_result` | Rows: Bp Div Type, Predict Result. Columns: SUM(Volume Bu). Label: Share Of All Segments | as sheet 2 |
| 4 | `segment_outstanding` | Rows: Bp Div Type, Predict Result. Columns: SUM(Volume Bu). Label: CNTD(Cif Id) | Deal Status (context, shown), Bp Div Type, Predict Maturity, In N7…In N90, Days To Pred Maturity (all shown) |
| 5 | `TRE_maturity_calendar_n30d` | Columns: Predict Maturity (exact date, discrete). Rows: SUM(Volume Bu). Color: Predict Result. Tooltip: MIN(Customers (all results)) | Bp Div Type = Treasures(HK) (context, hidden), Deal Status = LIVE (context, shown), Cust District, Cust Branch, Predict Maturity, In N7…In N90 (shown) |
| 6 | `TRE_maturity_branch_n30d` | Rows: Cust District, Cust Branch. Columns: SUM(Volume Bu). Color: Predict Result. Tooltip: MIN(Customers (all results)) | as sheet 5 |
| 7 | `TRE_maturity_detail_n30d` | Rows (all discrete): Predict Maturity (exact date), Cust District, Cust Branch, Rm Name, Cif Id, Predict Result, Trade Currency, Volume, Asset Tks, Asset Tks 2, Strike Percentage, Ko Percentage, Ki Percentage, Pos Id, Wps. Text: SUM(Volume Bu), AVG(Wps Mtm) | as sheet 5, plus Wps (shown, W6) |
| 8 | `ALL_outstanding_District_n30d` | Rows: Bp Div Type, Cust District. Columns: SUM(Volume Bu). Color: Predict Result. Tooltip: MIN(Customers (all results)) | Bp Div Type excludes Treasures(TPC) (context; the stand-in exclusion rule), Deal Status = LIVE (context, shown), Predict Maturity, In N7…In N90 (shown) |
| 9 | `ALL_outstanding_simulation_n30d` | Rows: Wps. Columns: SUM(Volume Bu). Color: Predict Result | Deal Status = LIVE (context, shown), Bp Div Type, Predict Maturity, In N7…In N90 (shown) |
| 10 | `TRE_outstanding_simulation_n30d` | as sheet 9 | Bp Div Type = Treasures(HK) and Deal Status = LIVE (context), Cust District, Cust Branch, Predict Maturity, In N7…In N90 (shown) |
| 11 | `ALL_outstanding_distribution_n30d` | Columns: MTM% (bin). Rows: CNTD(Asset Id). Marks: Circle, Size SUM(Volume Bu), Color Predict Result, Label Wps | Deal Status = LIVE (context, shown), Bp Div Type, Cust District, Cust Branch, Predict Maturity, In N7…In N90 (shown) |
| 12 | `max_trade_date` | Text: MAX(Trade Date) | Bp Div Type (shown) |
| 13 | `data_as_of` | Rows: Business Date (exact date, discrete), Last Refresh (discrete) | none |

**Publish As** workbook name `HK_ELI`, and leave **Show sheets as tabs** on so every sheet is a view.

You can start with fewer sheets: 13, 6 and 7 are enough for the branch-to-clients flow. Questions that
need a missing sheet get a "can't answer" reply.

## 5. Give the POC the settings

In GitHub: **repo → Settings → Secrets and variables → Codespaces → New secret**, one for each:

| Secret | Value |
|---|---|
| `TABLEAU_MODE` | `real` |
| `TABLEAU_SERVER` | step 1 server |
| `TABLEAU_SITE` | step 1 site |
| `TABLEAU_CLIENT_ID` | step 2 |
| `TABLEAU_SECRET_ID` | step 2 |
| `TABLEAU_SECRET_VALUE` | step 2 |
| `TABLEAU_USER` | your Tableau Cloud login email |

For a local run, export the same variables in your shell instead.

## 6. Check, then run

```bash
cd poc
python scripts/check_tableau.py      # signs in, finds the 13 sheets, compares their columns
./run.sh                             # open http://localhost:8050 (Codespaces opens it for you)
```

`check_tableau.py` prints `OK`, `MISS` (sheet not published under that name) or `DIFF` (a column
the pipeline needs is missing, usually a field in Measure Values or a renamed caption).

On the Ask page the pane header says **Live Tableau · <site>**. Each answer loads the real view
with the same filters, the top branch is selected, and clicking a mark offers a follow-up question.
The W1–W7 side-by-side page keeps using the mock, because it needs both workbook versions.

## If something fails

| You see | Likely cause |
|---|---|
| "Couldn't load Tableau" in the pane | The browser can't reach the Tableau server, or a blocker stopped the script |
| "Tableau refused to show this view" | Connected App not enabled, domain not in the allowlist, or the sheet name differs |
| "Tableau is not reachable right now" in chat | Wrong server/site, or the secret values don't match (REST sign-in failed) |
| `DIFF ... missing ['Volume Bu']` | The measure is in Measure Values, or the export uses another header; put it on Rows/Columns/Text |
| A filter seems ignored | The field isn't a shown filter on that sheet, or `In N30` is still Boolean instead of String |

*Will be part of Ask-MIRA in future
