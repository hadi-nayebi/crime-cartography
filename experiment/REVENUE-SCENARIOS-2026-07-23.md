# Crime Cartography revenue and seat-cap scenarios

Status: **planning model only; not a forecast, offer, or payout promise**

## What is known

YouTube defines RPM as revenue per 1,000 views after YouTube's revenue share,
including all views rather than only monetized views. YouTube also says there
are no guarantees about how much a partner will be paid. Watch Page ads pay an
eligible partner 55% of net ad revenue under the Watch Page Monetization
Module. See the [RPM documentation](https://support.google.com/youtube/answer/9314357),
the [partner earnings overview](https://support.google.com/youtube/answer/72902),
and the [YPP requirements](https://support.google.com/youtube/answer/72851).

Ad revenue eligibility currently requires 1,000 subscribers plus either 4,000
public long-form watch hours in the last 365 days or 10 million public Shorts
views in the last 90 days. Earlier YPP access at 500 subscribers is a separate
feature tier in eligible regions; it is not the same as full watch-page ad
revenue eligibility. The project's internal seat cap must never be presented
as a YouTube threshold.

## Planning formula

```text
modeled platform revenue = total views / 1,000 × assumed RPM
distributable surplus = max(0, receipts - direct costs - approved manager cost
                            - taxes/accounting provision - war-chest contribution)
```

The RPM bands below are explicit modeling assumptions, not observed Crime
Cartography performance. They should be replaced with the channel's own
Analytics RPM after monetization and a meaningful sample.

| Phase | Illustrative publishing volume | Monthly views | Assumed RPM | Modeled gross platform revenue |
|---|---:|---:|---:|---:|
| Pilot | 20 × 10k-view videos | 200k | $1.50–$4 | $300–$800 |
| Traction | 20 × 50k-view videos | 1m | $2.50–$6 | $2,500–$6,000 |
| Strong month | 20 × 250k-view videos | 5m | $3–$8 | $15,000–$40,000 |
| Breakout | 20 × 1m-view videos | 20m | $3–$8 | $60,000–$160,000 |

Longer videos should not be stretched solely for advertising. YouTube documents
that mid-roll ads can be enabled on monetized videos eight minutes or longer,
but ad slots are not guaranteed to serve. The editorial contract remains the
priority. See [mid-roll guidance](https://support.google.com/youtube/answer/6175006).

## Seat-cap design

Keep three concepts separate:

1. **Project email list:** may remain open while the project is learning.
2. **Active editorial cohort:** a bounded group selected for a specific review
   beta. A first cap of 100 is a reasonable experiment to discuss; 500 is a
   readiness milestone, not a mandatory seat count.
3. **Economic eligibility cohort:** only defined by a later effective agreement
   after legal, tax, privacy, accounting, and identity review.

A 100-person cohort makes the cap legible and reduces early administrative
load. A 500-person cohort offers more diversity but increases review,
moderation, privacy, and accounting complexity. The public project page should
let participants discuss and vote on the proposed active-cohort cap; a vote
alone does not create an economic entitlement.

## Illustrative allocation checks

These are arithmetic examples only. They assume 100 active contributors and a
90% future contributor pool after costs and reserve; they do not recommend an
effective payout rule.

| Modeled gross | Costs + manager + reserve | Remaining surplus | 90% pool | Equalized illustration before contribution ladders |
|---:|---:|---:|---:|---:|
| $500 | $700 | $0 | $0 | $0 per person |
| $4,000 | $2,000 | $2,000 | $1,800 | $18 per person |
| $25,000 | $6,000 | $19,000 | $17,100 | $171 per person |
| $120,000 | $20,000 | $100,000 | $90,000 | $900 per person |

The proposed individual cap of $2,000 would apply after a valid cohort,
contribution record, identity, tax, and payment process exists. Excess after
all active caps could return to the war chest or fund a collectively approved
new format, channel, or nonprofit contribution. The manager's proposed $42 per
hour rate and monthly cap are costs to be published and approved before any
operative economic stage; they are not current wages.

Open questions belong in the project's GitHub Discussions: the active-cohort
cap, reserve minimum, manager monthly cap, contribution ladder, overflow use,
and the milestone that triggers a live Q&A before the next video drop.
