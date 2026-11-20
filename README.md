# Token Launch Radar — a make.fun token-radar-01 entry

An offline radar for pre-token protocols. It reads the sealed DefiLlama snapshot
(`input/snapshot.json`: 758 protocols as of 2026-11-14), ranks every protocol that
records no token yet by an implied launch market cap, and renders the board as a
static dashboard with a farm plan for every row.

**Result of a clean run:** 200 board rows — all 40 watchlist protocols plus 160
"early" pre-token protocols below the $50M watchlist floor — and 24 live-token
protocols set aside and shown at their real market caps.

## The model (radar-2)

Implied value is built only from snapshot fields, and its evidence is the market
itself: the snapshot's token-bearing protocols that carry a market cap
(144 comparables in this snapshot).

1. For each comparable, take `mcap_usd / tvl_usd`, winsorised to [0.001, 10] so
   one absurd print cannot move a median.
2. A category's multiple is its comparables' median, shrunk toward the global
   median by sample size: `(n × median + 5 × global) / (n + 5)`, clamped to
   [0.02, 2.0]. Thin categories are pulled hardest to the global figure; a
   category with no comparables uses it directly.
3. `implied = TVL × category_multiple × growth × maturity × breadth`, where
   growth = `1 + clamp(change_7d, −60, 120)/100 × 0.5`, maturity =
   `0.6 + min(age_days, 1095)/1095 × 0.4` (unknown age: 365 days), and breadth =
   `1 + min(chains − 1, 5) × 0.04`.

Limits, stated in the dashboard too: comparables are survivors, so implied
values are optimistic by construction; TVL is not revenue or supply data, so
this is a market-cap scenario at today's TVL, not a launch price; and most
protocols on the board may never issue a token. Farm plans are derived from
each protocol's category family, chains, TVL and age — a core position, a
depth action, a weekly cadence, a hold, and a points/governance check — never
from a hand-written list of names.

## Layout

- `main.ts` — the entrypoint the grader runs (Node 22, standard library only).
  Validates the board with `boardIssue`, writes `board.json` + `data.js`,
  copies `dashboard/` and `screenshots/`, and writes `dossier.json` last.
- `lib/model.ts` — the model: snapshot parsing, comparable ratios, implied
  value, farm plans, and the gate check. The only file that scores anything.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged.
- `dashboard/` — a static, offline page (no network, no external assets):
  search, category / chain / minimum-TVL filters, a watchlist-only toggle,
  sortable columns, a detail view for every row with its full valuation
  breakdown and farm plan, the comparables table, and the methodology.
- `screenshots/` — three renders of the built dashboard: the board, one
  protocol's detail view, and a filtered view.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Exits 0 and prints the row counts when the board passes the gate; exits
non-zero if the model ever writes a board the gate refuses.
