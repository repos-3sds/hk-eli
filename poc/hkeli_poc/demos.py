"""The seven side-by-side demos: one question per worksheet change W1-W7.

Each demo runs the same question through the same pipeline twice: against the
workbook as it is today ("current") and with the change applied ("proposed").
Nothing in the pipeline is special-cased per demo.
"""

DEMOS = [
    dict(id="w1", w="W1", priority="Needed for launch",
         title="Predicted maturity by days",
         ask="On views 4 to 11, add days_to_pred_maturity (whole days from business_date) or yes/no flags for the next 7, 14, 30, 60 and 90 days.",
         question="Which branches in D1 have the largest TRE predicted maturity in the next 60 days?",
         today=("The TRE maturity views have the next 30 days built into the sheet, and the data export can only filter "
                "exact values, never a date range. So anything other than 30 days either fails or needs a fragile list of "
                "dates in the URL."),
         fixed=("The bot sends one exact-value filter (in_n60 = TRUE). The same filter drives the embedded view, so the "
                "chart and the answer match for 7, 14, 30, 60 or 90 days."),
         spec="Filter Resolution 6; Semantic views 5, 6, 7, 10 (predict_maturity window); rediscovery 04 RQ 11.2 rows 1 to 4"),
    dict(id="w2", w="W2", priority="Needed for launch",
         title="Data as-of date", scenario="stale",
         ask="Add a small view with MAX(business_date) and the last refresh time, or add business_date to every view.",
         question="How much TRE ELI is predicted to mature in the next 7 days?",
         today=("Scenario: the overnight refresh stopped three nights ago. The workbook doesn't publish its data date, so the bot "
                "can't tell. It anchors 'next 7 days' on today's date and answers as if the data were current."),
         fixed=("The bot reads the data-as-of view first. It anchors the window on the business date and warns that the data is "
                "4 days old, so nobody acts on a stale list."),
         spec="Semantic view 12 (MAX(trade_date) is not freshness, SV-18); stakeholder answer: overnight refresh; 05 VI A6"),
    dict(id="w3", w="W3", priority="Needed for launch",
         title="Duplicate view ID",
         ask="segment_outstanding uses the same ID as #all_outatanding_segment. Give it its own ID, e.g. outstanding-segment-customers.",
         question="How many TRE customers are predicted to KO?",
         today=("Two views share the record id 'outstanding-segment'. Any registry keyed on the id keeps one and loses the "
                "other, so the view with distinct customer counts can't be reached."),
         fixed="With its own id, the customer-count view is routable and the answer comes straight from COUNTD(cif_id).",
         spec="Semantic views index (views 2 and 4); rediscovery 02 SV-1, 06 PL 8 (logs key on record_id)"),
    dict(id="w4", w="W4", priority="Needed for launch",
         title="Live deals only on views 8, 9 and 11",
         ask="Confirm views 8, 9 and 11 show LIVE deals only, or add a deal_status = LIVE filter. Tell us view 8's segment-exclusion rule.",
         question="Compare outstanding ELI across districts for TRE",
         today=("The mock takes the cautious reading: with no deal_status filter, matured deals are included. The bot can't prove "
                "the population, so it warns, and its control total against view 1 doesn't reconcile."),
         fixed="With LIVE declared, district totals reconcile with total outstanding, and the exclusion rule can be stated.",
         spec="Semantic views 8, 9, 11 filter lists; SV-2, SV-20; 04 RQ 11.3 layer 5 (control totals)"),
    dict(id="w5", w="W5", priority="Needed for launch",
         title="CSV export keeps the calculations",
         ask="Check PERCENT_OF_TOTAL, COUNTD(cif_id) and COUNT(asset_id) come through the data export. If a table calc doesn't, use SUM(volume_bu)/{FIXED : SUM(volume_bu)}.",
         question="What percentage of outstanding ELI is TRE predicted KO?",
         today=("The mock shows the case W5 asks you to rule out: the share is a table calculation and the export leaves it out. "
                "The bot is not allowed to recompute a published percentage, so it can't answer."),
         fixed=("A FIXED level-of-detail share is a plain field, so it exports, and it keeps the all-segment denominator even "
                "when a segment filter is applied. Making deal_status a context filter keeps it LIVE only."),
         spec="Semantic views 2, 3 (PERCENT_OF_TOTAL); SV-6, SV-16; 06 PL 9 item 8"),
    dict(id="w6", w="W6", priority="Nice to have",
         title="WPS filter on view 7",
         ask="Add wps as a filter on TRE_maturity_detail_n30d.",
         question="Which TRE clients have WPS 9988 HK maturing in the next 30 days?",
         today=("The server query can filter on wps, so the answer is right. But wps is not a filter on the view, so the embedded "
                "view can't apply it. The chart shows every position while the answer lists a few."),
         fixed="The embedded view filters to the same stock, so the list on screen matches the answer.",
         spec="Semantic view 7 filter list; rediscovery 02 gap 3 (risk-to-action loop); 05 VI A3 (admit when the chart can't match)"),
    dict(id="w7", w="W7", priority="Nice to have",
         title="Customer counts on views 5, 6 and 8",
         ask="Add COUNTD(cif_id) on views 5, 6 and 8 (e.g. {EXCLUDE [Predict Result] : COUNTD([Cif Id])}).",
         question="How many TRE customers in D1 have predicted maturity in the next 30 days?",
         today=("Distinct customers exist only at segment level (view 4). Adding counts up or counting rows would overcount, "
                "because one customer can hold several positions, so the bot declines."),
         fixed="The district view carries a distinct customer count for the selected scope, and the bot reads it directly.",
         spec="SV-7 (COUNTD is non-additive); DD-3; rediscovery 02 gap 6"),
]


def get(demo_id: str):
    return next((d for d in DEMOS if d["id"] == demo_id), None)
