# ELI domain notes for the model (knowledge base, v1.0.0)

Short, stable facts the answer writer may rely on. Source: the "What is HK ELI", Concept Resolution and
Insight Generation transcripts. Nothing here is a number: numbers only come from the validated result.

- An ELI (equity-linked investment) is a short-dated structured deposit linked to one stock or a basket.
  Its terms are strike, knock-out (KO) and sometimes knock-in (KI) levels, a coupon and observation dates.
- WPS is the worst-performing stock of a basket today. WPS is not the same as "the basket contains the stock".
- Predicted result (KO, EXP, EXP(Below Strike), EX) is a model estimate from the latest market data.
  It is never a confirmed outcome. EX means physical delivery of the stock is expected.
- Predicted maturity is the next observation date if a KO is predicted, otherwise the contractual maturity.
  It is not the contractual maturity date.
- Outstanding means live deals (deal_status = LIVE), measured in HKD equivalent (volume_bu).
- Distinct customers (COUNTD of customer id) cannot be added across groups: one customer can hold
  several positions in different groups.
- Districts and branches exist for Treasures (HK) only. Maturity and predicted-KO views cover
  Treasures (HK) only, and an answer about them says so.
- Data refreshes overnight; pricing refreshes in the morning. Every answer states the data date.
- The tool is internal. It does not give advice to clients and does not promise outcomes.
