#!/usr/bin/env python3
"""
Master Report Generator — YouShellNotPass
==========================================
Generates a comprehensive statistical analysis of study progress.
Queries Supabase (READ-ONLY), runs 7 statistical modules, outputs HTML.

Usage:
  python3 generate_report.py                    # Uses .env for credentials
  python3 generate_report.py --user-id UUID     # Specify user
  python3 generate_report.py --exam-date 2026-06-16

Environment variables (or .env file):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_KEY=eyJ...  (anon key — only reads via RLS)
  USER_ID=62194a25-...
  EXAM_DATE=2026-06-16  (optional, defaults to 2026-06-16)
"""

import argparse
import json
import math
import os
import random
import statistics
import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
from scipy import stats as sp

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

random.seed(42)
np.random.seed(42)

REPORT_DIR = Path(__file__).resolve().parent.parent.parent / "reports"


def get_config():
    parser = argparse.ArgumentParser(description="Generate Master Report")
    parser.add_argument("--user-id", default=os.getenv("USER_ID"))
    parser.add_argument("--exam-date", default=os.getenv("EXAM_DATE", "2026-06-16"))
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL"))
    parser.add_argument("--supabase-key", default=os.getenv("SUPABASE_KEY"))
    args = parser.parse_args()

    if not args.supabase_url or not args.supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY required (env vars or --flags)")
        sys.exit(1)
    if not args.user_id:
        print("ERROR: USER_ID required (env var or --user-id flag)")
        sys.exit(1)

    return args


# ════════════════════════════════════════════════════════════
# DATA FETCHING (READ-ONLY)
# ════════════════════════════════════════════════════════════

def fetch_data(supabase, user_id):
    """Fetch all needed data from Supabase. READ-ONLY queries only."""
    print("  Fetching data from Supabase (READ-ONLY)...")

    # Q1: Total questions in DB
    res = supabase.table("questions").select("id", count="exact").execute()
    total_db = res.count

    # Q2: Questions per topic (DB distribution)
    res = supabase.table("questions").select("topic").execute()
    topics_db = {}
    for row in res.data:
        t = row["topic"]
        topics_db[t] = topics_db.get(t, 0) + 1

    # Q3: User performance per topic (user_answers — final SRS state)
    res = (supabase.table("user_answers")
           .select("question_id, correct_count, wrong_count, questions(topic)")
           .eq("user_id", user_id)
           .execute())
    topics_user = {}
    for row in res.data:
        topic = row["questions"]["topic"] if row.get("questions") else "Unknown"
        if topic not in topics_user:
            topics_user[topic] = {"topic": topic, "n": 0, "c": 0, "w": 0}
        topics_user[topic]["n"] += 1
        topics_user[topic]["c"] += row["correct_count"]
        topics_user[topic]["w"] += row["wrong_count"]

    # Q4: Answer history per topic (all attempts — realistic accuracy)
    res = (supabase.rpc("get_topic_history_stats", {"p_user_id": user_id})
           .execute())
    # Fallback: if RPC doesn't exist, query answer_history directly
    if not res.data:
        res = (supabase.table("answer_history")
               .select("is_correct, questions(topic)")
               .eq("user_id", user_id)
               .execute())
        topics_history = {}
        for row in res.data:
            topic = row["questions"]["topic"] if row.get("questions") else "Unknown"
            if topic not in topics_history:
                topics_history[topic] = {"topic": topic, "n": 0, "c": 0, "w": 0}
            topics_history[topic]["n"] += 1
            if row["is_correct"]:
                topics_history[topic]["c"] += 1
            else:
                topics_history[topic]["w"] += 1
        topics_history = list(topics_history.values())
    else:
        topics_history = res.data

    # Q5: Daily performance
    res = (supabase.table("answer_history")
           .select("answered_at, is_correct")
           .eq("user_id", user_id)
           .order("answered_at")
           .execute())
    daily = {}
    for row in res.data:
        d = row["answered_at"][:10]
        if d not in daily:
            daily[d] = {"n": 0, "c": 0}
        daily[d]["n"] += 1
        if row["is_correct"]:
            daily[d]["c"] += 1
    daily_list = [
        {"d": d.split("-", 1)[1].replace("-", "/"), "n": v["n"],
         "a": round(v["c"] / v["n"] * 100, 1)}
        for d, v in sorted(daily.items())
    ]

    # Q6: Hourly performance (UTC)
    hourly = {}
    for row in res.data:
        h = int(row["answered_at"][11:13])
        if h not in hourly:
            hourly[h] = {"n": 0, "c": 0}
        hourly[h]["n"] += 1
        if row["is_correct"]:
            hourly[h]["c"] += 1
    hourly_utc = [
        {"h": h, "n": v["n"], "a": round(v["c"] / v["n"] * 100, 1)}
        for h, v in sorted(hourly.items())
    ]

    # Q7: SRS data
    res = (supabase.table("spaced_repetition")
           .select("confidence, next_review_date, interval")
           .eq("user_id", user_id)
           .execute())
    today_str = date.today().isoformat()
    srs = {"confident": {"total": 0, "due": 0, "intervals": []},
           "hesitant": {"total": 0, "due": 0, "intervals": []},
           "guessed": {"total": 0, "due": 0, "intervals": []}}
    for row in res.data:
        conf = row.get("confidence", "hesitant")
        if conf not in srs:
            conf = "hesitant"
        srs[conf]["total"] += 1
        if row.get("next_review_date") and row["next_review_date"] <= today_str:
            srs[conf]["due"] += 1
        if row.get("interval"):
            srs[conf]["intervals"].append(row["interval"])

    srs_clean = {}
    for conf, data in srs.items():
        avg_interval = (sum(data["intervals"]) / len(data["intervals"])
                        if data["intervals"] else 1.0)
        srs_clean[conf] = {
            "total": data["total"], "due": data["due"],
            "avg_interval": round(avg_interval, 1),
        }

    return {
        "total_db": total_db,
        "topics_db": topics_db,
        "topics_user": list(topics_user.values()),
        "topics_history": topics_history,
        "daily": daily_list,
        "hourly_utc": hourly_utc,
        "srs": srs_clean,
    }


def abort_if_no_user_data(data: dict) -> None:
    """Fail-fast sentinel: refuse to generate a report from empty fetch.

    The April 18 run produced a phantom report (readiness=37.5, MC median=38.2,
    flat 100% retention) because ``fetch_data`` silently returned empty
    collections and every compute_* step had a "return zeros on empty" branch.

    If both ``topics_user`` and ``daily`` are empty it means the fetch saw no
    user activity at all — usually a wrong USER_ID or an anon key hitting RLS.
    We stop here so downstream math never runs on nothing.
    """
    if not data.get("topics_user") and not data.get("daily"):
        sys.exit(
            "ABORT: fetch_data returned no user activity "
            "(topics_user=[], daily=[]). Check USER_ID, verify SUPABASE_KEY is "
            "a service_role key (needed to bypass RLS), or confirm the user "
            "has answered any questions. Refusing to generate a phantom report."
        )


# ════════════════════════════════════════════════════════════
# STATISTICAL MODULES
# ════════════════════════════════════════════════════════════

def compute_basics(data):
    total_answered = sum(t["n"] for t in data["topics_user"])
    total_correct = sum(t["c"] for t in data["topics_user"])
    total_attempts = sum(d["n"] for d in data["daily"])
    accuracy = round(total_correct / total_answered * 100, 1) if total_answered else 0
    coverage_pct = round(total_answered / data["total_db"] * 100, 1)
    srs_total = sum(v["total"] for v in data["srs"].values())
    srs_due = sum(v["due"] for v in data["srs"].values())
    srs_backlog_pct = round(srs_due / srs_total * 100, 1) if srs_total else 0
    return {
        "total_answered": total_answered, "total_correct": total_correct,
        "total_attempts": total_attempts, "accuracy": accuracy,
        "coverage_pct": coverage_pct, "srs_total": srs_total,
        "srs_due": srs_due, "srs_backlog_pct": srs_backlog_pct,
    }


def compute_ols_trend(data):
    accs = [d["a"] for d in data["daily"]]
    x = np.arange(len(accs), dtype=float)
    y = np.array(accs, dtype=float)
    slope, intercept, r_value, p_value, _ = sp.linregress(x, y)
    trend_line = [round(intercept + slope * i, 1) for i in range(len(accs))]
    return {
        "slope": round(slope, 3), "intercept": round(intercept, 1),
        "r_squared": round(r_value**2, 3), "p_value": round(p_value, 3),
        "trend_line": trend_line,
    }


def compute_bootstrap_ci(data, n_iter=2000):
    results = {}
    for t in data["topics_user"]:
        if t["n"] < 4:
            continue
        arr = [1]*t["c"] + [0]*t["w"]
        means = sorted(sum(random.choices(arr, k=len(arr))) / len(arr) * 100
                        for _ in range(n_iter))
        results[t["topic"]] = {
            "lo": round(means[int(n_iter * 0.025)], 1),
            "hi": round(means[int(n_iter * 0.975)], 1),
            "obs": round(t["c"] / t["n"] * 100, 1),
        }
    return results


def compute_monte_carlo(data, days_left, n_sim=10000):
    """DB-weighted MC using user_answers (correct_count/answered_count) for reliable posteriors."""
    topics_user = data["topics_user"]
    topics_db = data["topics_db"]
    total_db = data["total_db"]

    seen = set()
    params = []
    accounted = 0

    for t in topics_user:
        db = topics_db.get(t["topic"], max(t["n"], 5))
        params.append((t["c"] + 1, t["w"] + 1, db / total_db))
        seen.add(t["topic"])
        accounted += db

    for topic, db in topics_db.items():
        if topic not in seen:
            params.append((1.2, 1.8, db / total_db))
            accounted += db

    remaining = max(0, 1.0 - accounted / total_db)
    if remaining > 0.01:
        params.append((1.2, 1.8, remaining))

    scores = sorted(
        sum(random.betavariate(a, b) * w for a, b, w in params) * 100
        for _ in range(n_sim)
    )
    median = round(statistics.median(scores), 1)
    buckets = list(range(30, 100, 5))
    hist = [[b, round(sum(1 for s in scores if b <= s < b + 5) / n_sim * 100, 2)]
            for b in buckets]

    return {
        "median": median,
        "p5": round(scores[int(n_sim * 0.05)], 1),
        "p95": round(scores[int(n_sim * 0.95)], 1),
        "p60": round(sum(1 for s in scores if s >= 60) / n_sim * 100, 1),
        "p70": round(sum(1 for s in scores if s >= 70) / n_sim * 100, 1),
        "p80": round(sum(1 for s in scores if s >= 80) / n_sim * 100, 1),
        "hist": hist,
    }


def compute_evpi(data):
    results = []
    topics_db = data["topics_db"]
    total_db = data["total_db"]
    for t in data["topics_user"]:
        if t["n"] < 3:
            continue
        db = topics_db.get(t["topic"], 10)
        acc = t["c"] / t["n"]
        p_fail = (t["w"] + 1) / (t["n"] + 2)
        evpi = (db / total_db) * 0.08 * p_fail
        results.append({
            "topic": t["topic"], "db": db, "acc": round(acc * 100, 1),
            "evpi": round(evpi, 6), "p_fail": round(p_fail * 100, 1),
        })
    results.sort(key=lambda x: x["evpi"], reverse=True)
    return results[:15]


def compute_ebbinghaus(data, days_left):
    days = [0, 7, 14, 30, days_left]
    srs = data["srs"]
    curves = {}
    for conf, d in srs.items():
        S = d["avg_interval"] * (2.5 if conf == "confident" else 1.5 if conf == "hesitant" else 0.8)
        curves[conf] = [round(math.exp(-day / S) * 100, 1) if day > 0 else 100.0
                        for day in days]
    total = sum(v["total"] for v in srs.values())
    if total > 0:
        curves["total"] = [
            round(sum(curves[c][i] * srs[c]["total"] / total for c in srs), 1)
            for i in range(len(days))
        ]
    else:
        curves["total"] = [100.0] * len(days)
    return {"days": days, "curves": curves}


def compute_readiness(data, basics, mc, bootstrap):
    ua_total = sum(t["c"] + t["w"] for t in data["topics_user"])
    ua_correct = sum(t["c"] for t in data["topics_user"])
    ua_accuracy = ua_correct / ua_total * 100 if ua_total else 50
    accuracy_score = min(ua_accuracy, 100)
    # Coverage: fraction of DB answered, target 60%
    coverage_frac = basics["coverage_pct"] / 100
    coverage_score = min(100, coverage_frac / 0.6 * 100)

    topics_db = data["topics_db"]
    critical = [t for t in data["topics_user"]
                if t["n"] >= 5 and topics_db.get(t["topic"], 0) >= 50]
    critical_avg = (sum(t["c"] / t["n"] * 100 for t in critical) / len(critical)
                    if critical else 50)
    critical_score = min(critical_avg, 100)

    daily_accs = [d["a"] for d in data["daily"] if d["n"] >= 5]
    if len(daily_accs) >= 3:
        consistency_score = max(0, min(100, 100 - statistics.stdev(daily_accs) * 3))
    else:
        consistency_score = 50

    readiness = round(
        accuracy_score * 0.25 + coverage_score * 0.25 +
        critical_score * 0.30 + consistency_score * 0.20, 1
    )
    return {
        "readiness": readiness,
        "accuracy_score": round(accuracy_score, 1),
        "coverage_score": round(coverage_score, 1),
        "critical_score": round(critical_score, 1),
        "critical_avg": round(critical_avg, 1),
        "consistency_score": round(consistency_score, 1),
        "hist_accuracy": round(ua_accuracy, 1),
    }


def compute_marginal_gains(data: dict, days_left: int, n_sim: int = 10000) -> list[dict]:
    """For each topic, simulate adding 20 correct answers and measure delta P(>=70%)."""
    topics_user = data["topics_user"]
    topics_db = data["topics_db"]
    total_db = data["total_db"]

    def run_mc(overrides: dict | None = None) -> float:
        params = []
        for t in topics_user:
            c, w = t["c"], t["w"]
            if overrides and t["topic"] in overrides:
                c += overrides[t["topic"]]
            db = topics_db.get(t["topic"], max(t["n"], 5))
            params.append((c + 1, w + 1, db / total_db))
        for topic, db in topics_db.items():
            if topic not in {t["topic"] for t in topics_user}:
                params.append((1.2, 1.8, db / total_db))
        scores = [sum(random.betavariate(a, b) * wt for a, b, wt in params) * 100
                  for _ in range(n_sim)]
        return sum(1 for s in scores if s >= 70) / n_sim * 100

    baseline = run_mc()
    results = []
    for t in topics_user:
        if t["n"] < 3:
            continue
        delta = run_mc({t["topic"]: 20}) - baseline
        acc = round(t["c"] / (t["c"] + t["w"]) * 100, 1) if (t["c"] + t["w"]) else 0
        db = topics_db.get(t["topic"], 0)
        results.append({
            "name": t["topic"], "delta_p70": round(delta, 2),
            "current_acc": acc,
            "db_weight": round(db / total_db * 100, 1),
            "db_count": db,
        })
    results.sort(key=lambda x: x["delta_p70"], reverse=True)
    return results[:15]


def compute_tiers(data: dict) -> list[dict]:
    """Classify topics into Tier A/B/C by priority score = (weight * (1-accuracy)) / coverage."""
    topics_user = data["topics_user"]
    topics_db = data["topics_db"]
    total_db = data["total_db"]

    results = []
    for t in topics_user:
        total_attempts = t["c"] + t["w"]
        if total_attempts < 2:
            continue
        acc = t["c"] / total_attempts
        db = topics_db.get(t["topic"], 0)
        weight = db / total_db
        coverage = t["n"] / db if db > 0 else 0
        priority = (weight * (1 - acc)) / max(coverage, 0.05)
        results.append({
            "name": t["topic"], "priority": round(priority, 4),
            "accuracy": round(acc * 100, 1),
            "coverage": round(coverage * 100, 1),
            "db_count": db, "db_weight": round(weight * 100, 1),
        })
    results.sort(key=lambda x: x["priority"], reverse=True)
    cutoffs = [len(results) * 0.2, len(results) * 0.7]
    for i, r in enumerate(results):
        r["tier"] = "A" if i < cutoffs[0] else "B" if i < cutoffs[1] else "C"
    return results


def convert_hourly_to_israel(hourly_utc):
    israel = {}
    for h in hourly_utc:
        il_hour = (h["h"] + 3) % 24
        if il_hour in israel:
            old = israel[il_hour]
            total_n = old["n"] + h["n"]
            israel[il_hour] = {
                "h": il_hour, "n": total_n,
                "a": round((old["a"] * old["n"] + h["a"] * h["n"]) / total_n, 1),
            }
        else:
            israel[il_hour] = {"h": il_hour, "n": h["n"], "a": h["a"]}
    return sorted(israel.values(), key=lambda x: x["h"])


def compute_all(data, days_left):
    print("  Computing statistics...")
    basics = compute_basics(data)
    ols = compute_ols_trend(data)
    bootstrap = compute_bootstrap_ci(data)
    mc = compute_monte_carlo(data, days_left)
    evpi = compute_evpi(data)
    decay = compute_ebbinghaus(data, days_left)
    readiness = compute_readiness(data, basics, mc, bootstrap)
    hourly_il = convert_hourly_to_israel(data["hourly_utc"])
    print("  Computing marginal gains (this takes ~30s)...")
    marginal = compute_marginal_gains(data, days_left)
    tiers = compute_tiers(data)

    # Priority matrix
    priority = []
    for e in evpi:
        if e["acc"] < 60:
            pr = "CRITICAL"
        elif e["acc"] < 70:
            pr = "HIGH"
        elif e["acc"] < 80:
            pr = "MEDIUM"
        else:
            pr = "MAINTAIN"
        priority.append({**e, "priority": pr})

    # Topic table (using user_answers for reliable accuracy)
    topics_db = data["topics_db"]
    topic_table = []
    for t in data["topics_user"]:
        total_attempts = t["c"] + t["w"]
        if total_attempts < 4:
            continue
        obs = round(t["c"] / total_attempts * 100, 1)
        p_fail = round((t["w"] + 1) / (total_attempts + 2) * 100, 1)
        db = topics_db.get(t["topic"], 0)
        ci = bootstrap.get(t["topic"], {"lo": 0, "hi": 100})
        topic_table.append({
            "topic": t["topic"], "n_attempts": total_attempts,
            "obs": obs, "ci_lo": ci["lo"], "ci_hi": ci["hi"],
            "p_fail": p_fail, "db": db,
        })
    topic_table.sort(key=lambda x: x["p_fail"], reverse=True)

    # Scenarios
    base_p70 = mc["p70"]
    base_cov = basics["coverage_pct"]
    scenarios = [
        {"name": "A — ללא שינוי", "desc": "No more studying",
         "p70": base_p70, "cov": round(base_cov), "col": "#FF3D57", "qpd": 0},
        {"name": "B — שגרה 15q/יום", "desc": "15 questions/day + SRS",
         "p70": round(min(base_p70 + 5, 95), 1), "cov": round(min(base_cov + 15, 55)),
         "col": "#FFB020", "qpd": 15},
        {"name": "C — אופטימלי 30q", "desc": "30 questions/day + targeted",
         "p70": round(min(base_p70 + 10, 95), 1), "cov": round(min(base_cov + 25, 65)),
         "col": "#00D4CC", "qpd": 30},
        {"name": "D — מרתון 50q/יום", "desc": "50 questions/day intensive",
         "p70": round(min(base_p70 + 15, 95), 1), "cov": round(min(base_cov + 40, 75)),
         "col": "#7C3AED", "qpd": 50},
    ]

    # Trajectory
    weeks = min(days_left // 7 + 1, 10)
    trajectory = {
        "p70": [round(min(mc["p70"] + w * 4.5, 95), 1) for w in range(weeks)],
        "cov": [round(min(basics["coverage_pct"] + w * 3.5, 60)) for w in range(weeks)],
        "weeks": weeks,
    }

    return {
        "basics": basics, "ols": ols, "bootstrap": bootstrap,
        "mc": mc, "evpi": evpi, "decay": decay, "readiness": readiness,
        "scenarios": scenarios, "trajectory": trajectory,
        "hourly_il": hourly_il, "topic_table": topic_table,
        "priority": priority, "daily": data["daily"],
        "marginal_gains": marginal, "tiers": tiers,
        "srs": data["srs"], "days_left": days_left,
        "total_db": data["total_db"],
    }


# ════════════════════════════════════════════════════════════
# HTML GENERATION
# ════════════════════════════════════════════════════════════

def generate_html(S, report_date):
    """Generate the full HTML report. Returns the HTML string."""
    # Import the template generator
    template_path = Path(__file__).parent / "template.html"
    if template_path.exists():
        # Use Jinja2 template if available
        try:
            from jinja2 import Template
            with open(template_path) as f:
                tmpl = Template(f.read())
            return tmpl.render(S=S, date=report_date, json=json)
        except ImportError:
            pass

    # Inline generation (self-contained, no dependencies beyond stdlib)
    b = S["basics"]
    r = S["readiness"]
    mc = S["mc"]
    ols = S["ols"]
    decay = S["decay"]
    priority = S["priority"]
    scenarios = S["scenarios"]
    trajectory = S["trajectory"]
    daily = S["daily"]
    hourly_il = S["hourly_il"]
    topic_table = S["topic_table"]
    srs = S["srs"]
    days_left = S["days_left"]

    srs_total = sum(v["total"] for v in srs.values())
    srs_due = sum(v["due"] for v in srs.values())

    # Build topic rows
    topic_rows = ""
    for t in topic_table[:20]:
        c = "#FF3D57" if t["obs"] < 60 else "#FFB020" if t["obs"] < 70 else "#FFD93D" if t["obs"] < 80 else "#00D4CC"
        topic_rows += f'<tr><td>{t["topic"][:45]}</td><td>{t["n_attempts"]}</td>'
        topic_rows += f'<td style="color:{c}">{t["obs"]}%</td>'
        topic_rows += f'<td>{t["ci_lo"]}-{t["ci_hi"]}%</td><td>{t["p_fail"]}%</td><td>{t["db"]}</td></tr>\n'

    # Build priority rows
    pri_rows = ""
    for p in priority[:8]:
        c = {"CRITICAL": "#FF3D57", "HIGH": "#FFB020", "MEDIUM": "#FFD93D", "MAINTAIN": "#00D4CC"}[p["priority"]]
        pri_rows += f'<tr><td style="color:{c};font-weight:bold">{p["priority"]}</td>'
        pri_rows += f'<td>{p["topic"][:50]}</td><td>{p["acc"]}%</td>'
        pri_rows += f'<td>{p["p_fail"]}%</td><td>{p["db"]}</td><td>{p["evpi"]:.5f}</td></tr>\n'

    # Build scenario cards
    sc_html = ""
    for sc in scenarios:
        sc_html += f'''<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;
        border-left:4px solid {sc['col']};margin-bottom:12px">
        <div style="font-size:1.1em;font-weight:bold;color:{sc['col']}">{sc['name']}</div>
        <div style="color:#aaa;font-size:0.85em;margin:4px 0">{sc['desc']}</div>
        <div style="display:flex;gap:24px;margin-top:8px">
        <div>P(>=70%): <b>{sc['p70']}%</b></div><div>כיסוי: <b>{sc['cov']}%</b></div>
        <div>שאלות/יום: <b>{sc['qpd']}</b></div></div></div>\n'''

    # The actual HTML (abbreviated version of the full template)
    # In production, this would use Jinja2 template.html
    html = f"""<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Master Report - {report_date} - {days_left} days</title>
<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e1a;color:#e0e0e0;direction:rtl}}
.header{{background:linear-gradient(135deg,#1a1f36,#0d1025);padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center}}
.header h1{{font-size:1.8em;background:linear-gradient(135deg,#00D4CC,#7C3AED);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}}
.tabs{{display:flex;justify-content:center;background:#12162a;padding:8px 0 0;border-bottom:1px solid rgba(255,255,255,0.06)}}
.tab{{padding:10px 28px;cursor:pointer;color:#888;border-bottom:3px solid transparent}}
.tab:hover{{color:#ccc}}.tab.active{{color:#00D4CC;border-bottom-color:#00D4CC;font-weight:bold}}
.tab-content{{display:none;padding:24px 32px;max-width:1200px;margin:0 auto}}.tab-content.active{{display:block}}
.kpi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}}
.kpi-card{{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px;text-align:center}}
.kpi-value{{font-size:2.2em;font-weight:bold;margin:4px 0}}.kpi-label{{color:#888;font-size:0.85em}}
.section{{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:20px}}
.section h3{{color:#00D4CC;margin-bottom:12px}}
table{{width:100%;border-collapse:collapse;font-size:0.85em}}
th,td{{padding:8px 12px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06)}}
th{{color:#00D4CC;font-size:0.8em;text-transform:uppercase}}
.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
.insight-box{{background:linear-gradient(135deg,rgba(0,212,204,0.08),rgba(124,58,237,0.08));border:1px solid rgba(0,212,204,0.2);border-radius:12px;padding:16px;margin-bottom:16px}}
.insight-box h4{{color:#00D4CC;margin-bottom:8px}}
@media(max-width:768px){{.two-col{{grid-template-columns:1fr}}.kpi-grid{{grid-template-columns:repeat(2,1fr)}}}}
</style></head><body>
<div class="header"><h1>Master Report</h1>
<div style="color:#888;font-size:0.95em">{report_date} · {days_left} ימים למבחן · {b['total_attempts']} ניסיונות · {b['total_answered']} שאלות</div></div>
<div class="tabs">
<div class="tab active" onclick="switchTab('overview')">סקירה</div>
<div class="tab" onclick="switchTab('analytics')">ניתוח</div>
<div class="tab" onclick="switchTab('forecast')">תחזית</div>
<div class="tab" onclick="switchTab('action')">פעולה</div></div>

<div id="tab-overview" class="tab-content active">
<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-label">ERI</div><div class="kpi-value" style="color:#00D4CC">{r['readiness']}</div></div>
<div class="kpi-card"><div class="kpi-label">P(>=70%)</div><div class="kpi-value" style="color:#00D4CC">{mc['p70']}%</div></div>
<div class="kpi-card"><div class="kpi-label">דיוק (כל הניסיונות)</div><div class="kpi-value" style="color:#FFB020">{r['hist_accuracy']}%</div></div>
<div class="kpi-card"><div class="kpi-label">כיסוי</div><div class="kpi-value" style="color:#7C3AED">{b['coverage_pct']}%</div></div>
<div class="kpi-card"><div class="kpi-label">SRS Backlog</div><div class="kpi-value" style="color:#FF3D57">{srs_due}/{srs_total}</div></div>
<div class="kpi-card"><div class="kpi-label">MC חציון</div><div class="kpi-value" style="color:#00D4CC">{mc['median']}%</div></div>
</div>
<div class="section"><h3>ERI Radar</h3><div id="chart-radar"></div></div>
<div class="section"><h3>התקדמות יומית + OLS Trend</h3><div id="chart-daily"></div></div>
</div>

<div id="tab-analytics" class="tab-content">
<div class="two-col">
<div class="section"><h3>ביצועים לפי שעה</h3><div id="chart-hourly"></div></div>
<div class="section"><h3>MC התפלגות</h3><div id="chart-mc"></div></div></div>
<div class="section"><h3>טבלת נושאים</h3><table>
<tr><th>נושא</th><th>ניסיונות</th><th>דיוק</th><th>CI 95%</th><th>P(fail)</th><th>DB</th></tr>
{topic_rows}</table></div>
<div class="section"><h3>עקומת שכחה</h3><div id="chart-decay"></div></div>
</div>

<div id="tab-forecast" class="tab-content">
<div class="section"><h3>תרחישים</h3>{sc_html}</div>
<div class="section"><h3>תחזית שבועית</h3><div id="chart-trajectory"></div></div>
<div class="section"><h3>סיכויי עמידה</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center">
<div style="padding:16px;background:rgba(255,61,87,0.08);border-radius:8px"><div style="color:#FF3D57;font-size:0.85em">P(>=80%)</div><div style="font-size:2em;font-weight:bold;color:#FF3D57">{mc['p80']}%</div></div>
<div style="padding:16px;background:rgba(0,212,204,0.08);border-radius:8px"><div style="color:#00D4CC;font-size:0.85em">P(>=70%)</div><div style="font-size:2em;font-weight:bold;color:#00D4CC">{mc['p70']}%</div></div>
<div style="padding:16px;background:rgba(124,58,237,0.08);border-radius:8px"><div style="color:#7C3AED;font-size:0.85em">P(>=60%)</div><div style="font-size:2em;font-weight:bold;color:#7C3AED">{mc['p60']}%</div></div></div></div>
</div>

<div id="tab-action" class="tab-content">
<div class="insight-box"><h4>מה ללמוד עכשיו?</h4><p>EVPI Priority Matrix:</p></div>
<div class="section"><h3>EVPI Priority</h3><table>
<tr><th>עדיפות</th><th>נושא</th><th>דיוק</th><th>P(fail)</th><th>DB</th><th>EVPI</th></tr>
{pri_rows}</table></div></div>

<script>
function switchTab(id){{document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
document.getElementById('tab-'+id).classList.add('active');event.target.classList.add('active');
setTimeout(()=>window.dispatchEvent(new Event('resize')),50)}}
const D={{paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{{color:'#ccc'}},margin:{{t:30,r:30,b:40,l:50}},
xaxis:{{gridcolor:'rgba(255,255,255,0.06)'}},yaxis:{{gridcolor:'rgba(255,255,255,0.06)'}}}};
Plotly.newPlot('chart-radar',[{{type:'scatterpolar',r:[{r['accuracy_score']},{r['coverage_score']},{r['critical_score']},{r['consistency_score']},{r['accuracy_score']}],
theta:['דיוק','כיסוי','קריטיים','עקביות','דיוק'],fill:'toself',fillcolor:'rgba(0,212,204,0.15)',line:{{color:'#00D4CC',width:2}}}}],
{{...D,polar:{{bgcolor:'rgba(0,0,0,0)',radialaxis:{{visible:true,range:[0,100],gridcolor:'rgba(255,255,255,0.08)'}}}},showlegend:false,height:350}},{{responsive:true}});

const dd={json.dumps([d['d'] for d in daily])},da={json.dumps([d['a'] for d in daily])},dn={json.dumps([d['n'] for d in daily])},tl={json.dumps(ols['trend_line'])};
Plotly.newPlot('chart-daily',[{{x:dd,y:da,type:'scatter',mode:'lines+markers',name:'דיוק',line:{{color:'#00D4CC',width:2}}}},
{{x:dd,y:tl,type:'scatter',mode:'lines',name:'OLS ({ols['slope']}%/d)',line:{{color:'#FFB020',dash:'dash'}}}},
{{x:dd,y:dn,type:'bar',name:'שאלות',yaxis:'y2',marker:{{color:'rgba(124,58,237,0.3)'}}}}],
{{...D,height:350,yaxis:{{...D.yaxis,range:[50,100]}},yaxis2:{{overlaying:'y',side:'left',showgrid:false,range:[0,250]}},legend:{{x:0,y:1.15,orientation:'h'}}}},{{responsive:true}});

const hh={json.dumps([h['h'] for h in hourly_il])},ha={json.dumps([h['a'] for h in hourly_il])},hn={json.dumps([h['n'] for h in hourly_il])};
Plotly.newPlot('chart-hourly',[{{x:hh.map(h=>h+':00'),y:ha,type:'bar',marker:{{color:ha.map(a=>a>=80?'#00D4CC':a>=70?'#FFB020':'#FF3D57')}},
text:hn.map(n=>'n='+n),textposition:'outside'}}],{{...D,height:300,yaxis:{{...D.yaxis,range:[50,100]}},showlegend:false}},{{responsive:true}});

const mb={json.dumps([h[0] for h in mc['hist']])},mp={json.dumps([h[1] for h in mc['hist']])};
Plotly.newPlot('chart-mc',[{{x:mb.map(b=>b+'-'+(b+5)+'%'),y:mp,type:'bar',
marker:{{color:mb.map(b=>b>=70?'#00D4CC':b>=60?'#FFB020':'#FF3D57')}}}}],
{{...D,height:300,showlegend:false,annotations:[{{x:'70-75%',y:Math.max(...mp)*0.9,text:'P(>=70%)={mc['p70']}%',showarrow:false,font:{{color:'#00D4CC',size:14}}}}]}},{{responsive:true}});

Plotly.newPlot('chart-decay',[
{{x:{json.dumps(decay['days'])},y:{json.dumps(decay['curves']['confident'])},name:'Confident',line:{{color:'#00D4CC'}},mode:'lines+markers'}},
{{x:{json.dumps(decay['days'])},y:{json.dumps(decay['curves']['hesitant'])},name:'Hesitant',line:{{color:'#FFB020'}},mode:'lines+markers'}},
{{x:{json.dumps(decay['days'])},y:{json.dumps(decay['curves']['guessed'])},name:'Guessed',line:{{color:'#FF3D57'}},mode:'lines+markers'}},
{{x:{json.dumps(decay['days'])},y:{json.dumps(decay['curves']['total'])},name:'Total',line:{{color:'#7C3AED',dash:'dash',width:3}},mode:'lines+markers'}}],
{{...D,height:300,yaxis:{{...D.yaxis,range:[0,105]}},legend:{{x:0.6,y:0.95}}}},{{responsive:true}});

const tw=Array.from({{length:{trajectory['weeks']}}},(_,i)=>'שבוע '+i);
Plotly.newPlot('chart-trajectory',[{{x:tw,y:{json.dumps(trajectory['p70'])},type:'scatter',mode:'lines+markers',name:'P(>=70%)',
line:{{color:'#00D4CC'}},fill:'tozeroy',fillcolor:'rgba(0,212,204,0.1)'}},
{{x:tw,y:{json.dumps(trajectory['cov'])},type:'scatter',mode:'lines+markers',name:'כיסוי',yaxis:'y2',line:{{color:'#7C3AED'}}}}],
{{...D,height:300,yaxis:{{...D.yaxis,range:[0,100]}},yaxis2:{{overlaying:'y',side:'left',showgrid:false,range:[0,100]}},legend:{{x:0,y:1.15,orientation:'h'}}}},{{responsive:true}});
</script>
<div style="text-align:center;padding:20px;color:#555;font-size:0.75em">
Generated: {report_date} · Engine: Beta-Binomial MC (N=10K) + OLS + Bootstrap (N=2K) + Ebbinghaus</div>
</body></html>"""
    return html


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    config = get_config()
    exam_date = date.fromisoformat(config.exam_date)
    today = date.today()
    days_left = (exam_date - today).days
    report_date = today.strftime("%d.%m.%Y")

    print(f"\n{'='*60}")
    print(f"  Master Report Generator — {report_date}")
    print(f"  {days_left} days to exam ({config.exam_date})")
    print(f"{'='*60}\n")

    supabase = create_client(config.supabase_url, config.supabase_key)
    data = fetch_data(supabase, config.user_id)
    abort_if_no_user_data(data)
    stats = compute_all(data, days_left)

    # Generate HTML
    print("  Generating HTML report...")
    html = generate_html(stats, report_date)

    # Save
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORT_DIR / f"master_report_{today.isoformat()}.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"  Report saved to: {out_path}")
    print(f"  Size: {len(html):,} bytes")

    # Save stats JSON
    json_path = REPORT_DIR / f"master_stats_{today.isoformat()}.json"
    json_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    print(f"  Stats JSON saved to: {json_path}")

    # Print summary
    r = stats["readiness"]
    mc = stats["mc"]
    print(f"\n  ERI:      {r['readiness']}/100")
    print(f"  P(>=70%): {mc['p70']}%")
    print(f"  Accuracy: {r['hist_accuracy']}% (all attempts)")
    print(f"  Coverage: {stats['basics']['coverage_pct']}%")
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()
