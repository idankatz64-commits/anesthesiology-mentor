# Legacy v2 Master Report (April 11, 2026)

These are the original scripts that generated the full 5-tab report design
(`reports/master_report_2026-04-11_v2.html`). They were previously in `/tmp/`
and would have been lost with the session. Preserved here so the design work
is never lost again.

## Files

| File | Purpose |
|---|---|
| `master_report_v2.py` | Computation engine with embedded raw data (April 11 snapshot). Writes `master_stats_v2.json`. |
| `gen_html_v2.py` | Reads `master_stats_v2.json` → produces full 5-tab HTML (EVPI table, Tier table, Marginal Gain chart, 3-phase framework, weekly milestones). |
| `master_stats_v2.json` | The frozen April 11 stats snapshot (shape reference for the template). |

## Regenerating the full-design HTML (as a static reference)

```bash
cd scripts/master-report/_legacy_v2
python3 gen_html_v2.py > ../../../reports/master_report_legacy_v2.html
```

This reproduces the April 11 HTML with **frozen data** — not live.

## TODO — Wiring to live data

`generate_report.py` (the live, Supabase-backed script one level up) currently
produces a **simpler** HTML. To get the full-design HTML with live data:

1. Refactor `gen_html_v2.py` into a `html_template.py` module that exposes
   `generate_html(stats_dict) -> str`.
2. Extend `compute_all()` in `generate_report.py` to output a v2-shape dict with:
   - `globals` (accuracy, coverage, topics_studied/total, totals)
   - `monte_carlo.thresholds.p_ge_{60,65,70,75,80}` + `percentiles.p{5,25,50,75,95}` + `histogram`
   - `srs.breakdown.{confident,hesitant,guessed}` with total/active/due/never_reviewed/avg_ease/avg_interval
   - `ebbinghaus.{confident,hesitant,guessed}.retention.day_{0,7,14,30,66}`
   - `weekly` structure
   - `bayesian_pfail` list
3. Replace the inline `generate_html` in `generate_report.py` with a call to
   `html_template.generate_html(v2_shape_stats)`.

Estimated work: ~300 lines of adapter + template module split.
